<?php

namespace App\EventListener;

use App\Entity\AuditLog;
use App\Entity\MessageLog;
use App\Entity\SoftDeletable;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\ORM\Event\OnFlushEventArgs;
use Doctrine\ORM\Event\PostFlushEventArgs;
use Doctrine\ORM\Events;
use Doctrine\ORM\UnitOfWork;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\RequestStack;

/** Writes an AuditLog row for every create / update / delete of an entity (author, IP, field diff). */
#[AsDoctrineListener(event: Events::onFlush)]
#[AsDoctrineListener(event: Events::postFlush)]
final class AuditListener
{
    private const SKIP_FIELDS = ['password', 'plainPassword'];

    /** @var list<array{string, object, ?int, array<string, mixed>}> */
    private array $pending = [];
    private bool $writing = false;

    public function __construct(private Security $security, private RequestStack $requests)
    {
    }

    public function onFlush(OnFlushEventArgs $args): void
    {
        $uow = $args->getObjectManager()->getUnitOfWork();
        foreach ($uow->getScheduledEntityInsertions() as $e) {
            $this->audited($e) && $this->pending[] = ['CREATE', $e, null, $this->diff($uow->getEntityChangeSet($e), true)];
        }
        foreach ($uow->getScheduledEntityUpdates() as $e) {
            if ($this->audited($e) && $diff = $this->diff($uow->getEntityChangeSet($e), false)) {
                $action = $e instanceof SoftDeletable && isset($diff['deletedAt']) ? 'DELETE' : 'UPDATE';
                $this->pending[] = [$action, $e, null, $diff];
            }
        }
        foreach ($uow->getScheduledEntityDeletions() as $e) {
            $this->audited($e) && $this->pending[] = ['DELETE', $e, $uow->getEntityIdentifier($e)['id'] ?? null, []];
        }
    }

    public function postFlush(PostFlushEventArgs $args): void
    {
        if ($this->writing || !$this->pending) {
            return;
        }
        $em = $args->getObjectManager();
        $user = $this->security->getUser()?->getUserIdentifier();
        $ip = $this->requests->getCurrentRequest()?->getClientIp();
        $this->writing = true; // the nested flush below re-enters this listener
        try {
            foreach ($this->pending as [$action, $entity, $id, $data]) {
                $id ??= method_exists($entity, 'getId') ? $entity->getId() : null;
                $em->persist(new AuditLog($user, $action, (new \ReflectionClass($entity))->getShortName(), $id, $data, $ip));
            }
            $this->pending = [];
            $em->flush();
        } finally {
            $this->writing = false;
        }
    }

    private function audited(object $e): bool
    {
        return !$e instanceof AuditLog && !$e instanceof MessageLog;
    }

    /**
     * @param array<string, array{mixed, mixed}> $changeSet
     *
     * @return array<string, mixed>
     */
    private function diff(array $changeSet, bool $creating): array
    {
        $out = [];
        foreach ($changeSet as $field => [$old, $new]) {
            if (in_array($field, self::SKIP_FIELDS, true)) {
                continue;
            }
            $out[$field] = $creating ? $this->scalar($new) : [$this->scalar($old), $this->scalar($new)];
        }

        return $out;
    }

    private function scalar(mixed $v): mixed
    {
        return match (true) {
            $v instanceof \BackedEnum => $v->value,
            $v instanceof \DateTimeInterface => $v->format(DATE_ATOM),
            is_object($v) => method_exists($v, 'getId') ? ['id' => $v->getId()] : null,
            default => $v,
        };
    }
}
