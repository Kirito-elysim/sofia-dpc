<?php

namespace App\Controller;

use App\Message\ZoomCapacityAlert;
use Symfony\Component\Messenger\MessageBusInterface;
use App\Entity\{ClassSlot, TimeSlot, Trainer, Formation, VirtualClass, ZoomAccount};
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\{JsonResponse, Request};
use Symfony\Component\Uid\Uuid;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class ClassSchedulingController extends AbstractController
{
    #[Route('/api/scheduled-classes', methods: ['POST'])]
    #[IsGranted('SOFIA_SCHEDULE')]
    public function __invoke(Request $request, EntityManagerInterface $em, MessageBusInterface $bus, #[Autowire('%env(int:ZOOM_BUFFER_MINUTES)%')] int $buffer): JsonResponse
    {
        $input = $request->toArray();
        $requestKey = $request->headers->get('Idempotency-Key');
        if (null !== $requestKey && !Uuid::isValid($requestKey)) {
            throw new UnprocessableEntityHttpException('Clé de réservation invalide.');
        }
        $formation = $em->find(Formation::class, $this->positiveId($input['formationId'] ?? null));
        $day = is_string($input['date'] ?? null) ? $input['date'] : '';
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $day, new \DateTimeZone('Europe/Paris'));
        if (!$date || $date->format('Y-m-d') !== $day || !$formation?->isActive() || !$formation->organization->active || $formation->getDeletedAt() || $formation->organization->getDeletedAt()) {
            throw new UnprocessableEntityHttpException('Date ou formation invalide.');
        }
        $class = new VirtualClass($formation, $date, $this->positiveId($input['capacity'] ?? 20));
        $class->dpcAction = $this->text($input['dpcAction'] ?? null, 80);
        $class->dpcSession = $this->text($input['dpcSession'] ?? null, 80);
        $class->reference = empty($input['reference']) ? null : $this->text($input['reference'], 100);
        $slots = $input['slots'] ?? [];
        if (!is_array($slots) || !array_is_list($slots) || !$slots) {
            throw new UnprocessableEntityHttpException('Choisissez au moins un créneau.');
        }
        $db = $em->getConnection();
        $db->beginTransaction();
        try {
            if (null !== $requestKey) {
                $owner = $this->getUser()?->getUserIdentifier() ?? '';
                $fingerprint = hash('sha256', $owner."\n".$request->getContent());
                $db->executeStatement('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [$requestKey]);
                $previous = $db->fetchAssociative('SELECT id, schedule_fingerprint FROM virtual_class WHERE schedule_key = ?', [$requestKey]);
                if ($previous) {
                    $db->commit();
                    return hash_equals($previous['schedule_fingerprint'], $fingerprint)
                        ? $this->json(['id' => (int) $previous['id']])
                        : $this->json(['detail' => 'Cette clé correspond à une autre réservation.'], 409);
                }
                $class->scheduleKey = $requestKey;
                $class->scheduleFingerprint = $fingerprint;
            }
            // Hold the formation until the session commits, including when deletion is requested concurrently.
            $em->refresh($formation, \Doctrine\DBAL\LockMode::PESSIMISTIC_READ);
            if (!$formation->isActive() || $formation->getDeletedAt()) {
                throw new UnprocessableEntityHttpException('Cette formation ne peut plus accueillir de session.');
            }
            // All schedulers acquire host locks in the same order. Under READ COMMITTED
            // the following overlap reads see the preceding scheduler's committed slots.
            $config = $db->fetchAssociative('SELECT c.id,c.policy,c.hosts FROM organization o
                JOIN virtual_class_config c ON c.id=o.virtual_class_config_id
                WHERE o.id=? AND NOT c.archived',[$formation->organization->getId()]);
            $hosts = $config
                ? $db->fetchFirstColumn('SELECT id FROM zoom_account WHERE active AND id IN
                    (SELECT value::int FROM jsonb_array_elements_text(?::jsonb)) ORDER BY id FOR UPDATE',[$config['hosts']])
                : $db->fetchFirstColumn('SELECT id FROM zoom_account WHERE active = TRUE AND oauth_connection_id IS NULL ORDER BY id FOR UPDATE');
            $em->persist($class);
            $em->flush();
            $seen = [];
            foreach ($slots as $row) {
                $slotId = $this->positiveId($row['timeSlotId'] ?? null);
                $time = $em->find(TimeSlot::class, $slotId);
                $trainer = $em->find(Trainer::class, $this->positiveId($row['trainerId'] ?? null));
                if (isset($seen[$slotId]) || !$time?->active || !$time->getDurationMin() || $time->getDeletedAt() || !$trainer?->active || $trainer->getDeletedAt() || !$trainer->getOrganizations()->contains($formation->organization)) {
                    throw new UnprocessableEntityHttpException('Créneau répété, horaire invalide ou formateur hors de l’organisme.');
                }
                $seen[$slotId] = true;
                $slot = new ClassSlot($class, $time, $trainer);
                $slot->startsAt = new \DateTimeImmutable($day.' '.$time->startTime, $date->getTimezone());
                $slot->endsAt = new \DateTimeImmutable($day.' '.$time->endTime, $date->getTimezone());
                $margin = max(0, $buffer);
                foreach ($hosts as $id) {
                    $busy = $db->fetchOne('SELECT 1 FROM class_slot WHERE zoom_account_id = ? AND starts_at < ? AND ends_at > ? LIMIT 1', [
                        $id, $slot->endsAt->modify("+$margin minutes")->format('Y-m-d H:i:s'), $slot->startsAt->modify("-$margin minutes")->format('Y-m-d H:i:s'),
                    ]);
                    if (false === $busy) {
                        $slot->zoomAccount = $em->getReference(ZoomAccount::class, (int) $id);
                        break;
                    }
                }
                if (!$slot->zoomAccount) {
                    $db->rollBack();
                    $em->clear();
                    $bus->dispatch(new ZoomCapacityAlert($formation->getId() ?? 0, $day, $time->label));
                    return $this->json(['code' => 'NO_ZOOM_ACCOUNT_AVAILABLE', 'detail' => 'Aucun compte Zoom disponible pour ce créneau.'], 409);
                }
                $slot->zoomPolicy = [
                    'configId'=>$config ? (int)$config['id'] : null,
                    'requested'=>$config ? json_decode($config['policy'],true,512,JSON_THROW_ON_ERROR) : \App\Zoom\ClassPolicy::DEFAULT,
                    'effective'=>null,
                ];
                $slot->zoomState = 'pending';
                $em->persist($slot);
                $em->flush();
            }
            $db->commit();
        } catch (\Throwable $e) {
            if ($db->isTransactionActive()) { $db->rollBack(); }
            $em->clear();
            throw $e;
        }
        return $this->json(['id' => $class->getId(), 'zoomState' => 'pending'], 201);
    }

    private function positiveId(mixed $value): int
    {
        if (!is_int($value) || $value < 1) { throw new UnprocessableEntityHttpException('Identifiant ou capacité invalide.'); }
        return $value;
    }

    private function text(mixed $value, int $limit): string
    {
        if (!is_string($value) || '' === trim($value) || mb_strlen($value) > $limit) {
            throw new UnprocessableEntityHttpException('Référence DPC manquante ou trop longue.');
        }
        return trim($value);
    }
}
