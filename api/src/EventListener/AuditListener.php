<?php

namespace App\EventListener;

use App\Entity\AuditLog;
use App\Entity\MessageLog;
use App\Entity\SoftDeletable;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\Common\Collections\Collection;
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
        if ($this->writing) {
            return; // the nested flush only writes audit rows
        }
        $uow = $args->getObjectManager()->getUnitOfWork();
        $changes = [];
        foreach ($uow->getScheduledEntityInsertions() as $e) {
            $changes[spl_object_id($e)] = ['CREATE', $e, null, $this->diff($uow->getEntityChangeSet($e), true)];
        }
        foreach ($uow->getScheduledEntityUpdates() as $e) {
            if ($diff = $this->diff($uow->getEntityChangeSet($e), false)) {
                $deleted = $e instanceof SoftDeletable && isset($diff['deletedAt'][1]);
                $action = match (true) {
                    $deleted => 'DELETE',
                    'archived' === ($diff['publicationStatus'][1] ?? null) || true === ($diff['archived'][1] ?? null) => 'ARCHIVE',
                    default => 'UPDATE',
                };
                // A deletion keeps what the record contained.
                $changes[spl_object_id($e)] = [$action, $e, null, $deleted ? $diff + $this->snapshot($uow->getOriginalEntityData($e)) : $diff];
            }
        }
        // Many-to-many links are not part of the change sets.
        foreach ([...$uow->getScheduledCollectionUpdates(), ...$uow->getScheduledCollectionDeletions()] as $collection) {
            $owner = $collection->getOwner();
            if (null === $owner || $uow->isScheduledForDelete($owner)) {
                continue;
            }
            $key = spl_object_id($owner);
            $changes[$key] ??= ['UPDATE', $owner, null, []];
            $new = array_values(array_map($this->scalar(...), $collection->toArray()));
            $old = array_values(array_map($this->scalar(...), $collection->getSnapshot()));
            $changes[$key][3][$collection->getMapping()->fieldName] = 'CREATE' === $changes[$key][0] ? $new : [$old, $new];
        }
        foreach ($uow->getScheduledEntityDeletions() as $e) {
            $changes[spl_object_id($e)] = ['DELETE', $e, $uow->getEntityIdentifier($e)['id'] ?? null, $this->snapshot($uow->getOriginalEntityData($e))];
        }
        foreach ($changes as $change) {
            $this->audited($change[1]) && $this->pending[] = $change;
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
                $id ??= method_exists($entity, 'getId') ? $entity->getId() : ($entity->id ?? null);
                $em->persist(new AuditLog($user, $action, $em->getClassMetadata($entity::class)->getReflectionClass()->getShortName(), $id, $data, $ip, $this->label($entity)));
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
            if ('thumbnail' === $field || 'profilePhoto' === $field) {
                $out[$field] = $creating ? (null === $new ? null : 'Image ajoutée') : [null === $old ? null : 'Ancienne image', null === $new ? null : 'Nouvelle image'];
                continue;
            }
            if (AuditPayload::sensitive($field)) {
                $out[$field] = $creating ? '[masqué]' : ['[masqué]', '[masqué]'];
                continue;
            }
            $out[$field] = $creating ? $this->scalar($new) : [$this->scalar($old), $this->scalar($new)];
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $original
     *
     * @return array<string, mixed>
     */
    private function snapshot(array $original): array
    {
        unset($original['id'], $original['deletedAt']);
        $original = array_filter($original, static fn (mixed $v): bool => !$v instanceof Collection);

        return $this->diff(array_map(static fn (mixed $v): array => [$v, null], $original), false);
    }

    private function label(object $e): ?string
    {
        $values = get_object_vars($e); // public properties only, which is where the names live
        $label = $values['name'] ?? $values['title'] ?? $values['label'] ?? null;
        $label ??= trim(($values['firstName'] ?? '').' '.($values['lastName'] ?? '')) ?: ($values['email'] ?? null);

        return is_string($label) ? mb_substr($label, 0, 255) : null;
    }

    private function scalar(mixed $v): mixed
    {
        return match (true) {
            $v instanceof \BackedEnum => $v->value,
            $v instanceof \DateTimeInterface => $v->format(DATE_ATOM),
            is_object($v) => method_exists($v, 'getId') || isset($v->id) ? array_filter(['id' => method_exists($v, 'getId') ? $v->getId() : $v->id, 'label' => $this->label($v)]) : null,
            default => AuditPayload::clean($v),
        };
    }
}
