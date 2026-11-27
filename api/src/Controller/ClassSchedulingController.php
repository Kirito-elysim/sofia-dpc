<?php

namespace App\Controller;

use App\Message\ZoomCapacityAlert;
use App\Service\{EnrollmentException, EnrollmentService, RegistrationService};
use Symfony\Component\Messenger\MessageBusInterface;
use App\Entity\{ClassSlot, SessionFormation, TimeSlot, Trainer, VirtualClass, ZoomAccount};
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
    public function __invoke(Request $request, EntityManagerInterface $em, MessageBusInterface $bus, RegistrationService $registrations, EnrollmentService $enrollments, #[Autowire('%env(int:ZOOM_BUFFER_MINUTES)%')] int $buffer): JsonResponse
    {
        $input = $request->toArray();
        $requestKey = $request->headers->get('Idempotency-Key');
        if (null !== $requestKey && !Uuid::isValid($requestKey)) {
            throw new UnprocessableEntityHttpException('Clé de réservation invalide.');
        }
        $day = is_string($input['date'] ?? null) ? $input['date'] : '';
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $day, new \DateTimeZone('Europe/Paris'));
        if (!$date || $date->format('Y-m-d') !== $day) {
            throw new UnprocessableEntityHttpException('Date invalide.');
        }
        $ids = $input['sessionFormationIds'] ?? null;
        if (!is_array($ids) || !array_is_list($ids) || !$ids) {
            throw new UnprocessableEntityHttpException('Choisissez au moins une formation de session.');
        }
        // The first one names the class; the others are served by the same meetings.
        $served = [];
        foreach (array_unique(array_map($this->positiveId(...), $ids)) as $id) {
            $item = $em->find(SessionFormation::class, $id);
            if (!$item || $item->getDeletedAt() || $item->session->getDeletedAt() || !$item->formation->isActive() || $item->formation->getDeletedAt()) {
                throw new UnprocessableEntityHttpException('Formation de session introuvable ou non publiée.');
            }
            // Access dates are calendar days: compare them as such, whatever their time zone.
            if ($day < $item->getEffectiveAccessStartsOn()->format('Y-m-d') || $day > $item->getEffectiveAccessEndsOn()->format('Y-m-d')) {
                throw new UnprocessableEntityHttpException('La date est hors des dates d’accès de « '.$item->formation->title.' » ('.$item->session->name.').');
            }
            $served[] = $item;
        }
        $organization = $served[0]->session->organization;
        foreach ($served as $item) {
            if ($item->session->organization !== $organization) {
                throw new UnprocessableEntityHttpException('Une classe ne réunit que des sessions du même organisme.');
            }
        }
        if (!$organization->active || $organization->getDeletedAt()) {
            throw new UnprocessableEntityHttpException('Cet organisme est inactif.');
        }
        $formation = $served[0]->formation;
        $class = new VirtualClass($formation, $date, $this->positiveId($input['capacity'] ?? $served[0]->capacity), organization: $organization);
        foreach ($served as $item) {
            $class->attach($item);
        }
        // DPC numbers come from the formation (action) and the session-formation (session).
        foreach ($formation->andpcCodes as $code) {
            if (($code['organization'] ?? $formation->organization->getId()) === $organization->getId() && (int) $code['year'] === (int) $date->format('Y') && !empty($code['code'])) {
                $class->dpcAction = mb_substr((string) $code['code'], 0, 80);
            }
        }
        $class->dpcSession = isset($served[0]->fundingNumbers['ANDPC']) ? mb_substr($served[0]->fundingNumbers['ANDPC'], 0, 80) : null;
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
            foreach ($served as $item) {
                $em->refresh($item->formation, \Doctrine\DBAL\LockMode::PESSIMISTIC_READ);
                $em->refresh($item, \Doctrine\DBAL\LockMode::PESSIMISTIC_READ);
                if (!$item->formation->isActive() || $item->formation->getDeletedAt() || $item->getDeletedAt()) {
                    throw new UnprocessableEntityHttpException('Cette formation ne peut plus accueillir de classe.');
                }
            }
            // All schedulers acquire host locks in the same order. Under READ COMMITTED
            // the following overlap reads see the preceding scheduler's committed slots.
            $config = $db->fetchAssociative('SELECT c.id,c.policy,c.hosts FROM organization o
                JOIN virtual_class_config c ON c.id=o.virtual_class_config_id
                WHERE o.id=? AND NOT c.archived',[$organization->getId()]);
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
                if (isset($seen[$slotId]) || !$time?->active || !$time->getDurationMin() || $time->getDeletedAt() || !$trainer?->active || $trainer->getDeletedAt() || !$trainer->getOrganizations()->contains($organization)) {
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
                    $bus->dispatch(new ZoomCapacityAlert($formation->getId() ?? 0, $day, $time->label, $organization->getId()));
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
            // Everyone already registered to the served session-formations joins the new class.
            try {
                $joined = $registrations->placeRegistered($class, $served);
            } catch (EnrollmentException $refused) {
                $db->rollBack();
                $em->clear();

                return $this->json(['code' => $refused->errorCode, 'detail' => $refused->getMessage()], $refused->status);
            }
            $db->commit();
        } catch (\Throwable $e) {
            if ($db->isTransactionActive()) { $db->rollBack(); }
            $em->clear();
            throw $e;
        }
        $enrollments->confirm($joined);

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
            throw new UnprocessableEntityHttpException('Référence vide ou trop longue.');
        }
        return trim($value);
    }
}
