<?php

namespace App\Controller;

use App\Dto\RegistrationChange;
use App\Dto\RegistrationInput;
use App\Entity\Registration;
use App\Entity\SessionFormation;
use App\Security\OrganizationScope;
use App\Service\EnrollmentException;
use App\Service\RegistrationService;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api')]
final class RegistrationController extends AbstractController
{
    public function __construct(private RegistrationService $registrations, private OrganizationScope $scope, private Connection $db)
    {
    }

    #[Route('/session-formations/{id<\d+>}/registrations', methods: 'GET')]
    #[IsGranted('SOFIA_LEARNERS')]
    public function list(SessionFormation $sessionFormation): JsonResponse
    {
        $this->guard($sessionFormation);
        $attendance = $this->attendance((int) $sessionFormation->getId());

        return $this->json([
            'session' => ['id' => $sessionFormation->session->getId(), 'name' => $sessionFormation->session->name],
            'formation' => ['title' => $sessionFormation->formation->title, 'fundingTypes' => $sessionFormation->formation->fundingTypes],
            'capacity' => $sessionFormation->capacity,
            'accessStartsOn' => $sessionFormation->getEffectiveAccessStartsOn()->format('Y-m-d'),
            'accessEndsOn' => $sessionFormation->getEffectiveAccessEndsOn()->format('Y-m-d'),
            'registrations' => array_map(fn (Registration $r) => $this->serialize($r) + ['attendance' => $attendance[$r->participant->getId()] ?? []], $sessionFormation->activeRegistrations()),
        ]);
    }

    #[Route('/session-formations/{id<\d+>}/registrations', methods: 'POST')]
    #[IsGranted('SOFIA_ENROLL')]
    public function create(SessionFormation $sessionFormation, #[MapRequestPayload] RegistrationInput $in): JsonResponse
    {
        $this->guard($sessionFormation);
        try {
            $registration = $this->registrations->register($sessionFormation, $in);
        } catch (EnrollmentException $e) {
            return $this->problem($e);
        }

        return $this->json($this->serialize($registration), Response::HTTP_CREATED);
    }

    #[Route('/registrations/{id<\d+>}', methods: 'PATCH')]
    #[IsGranted('SOFIA_ENROLL')]
    public function update(Registration $registration, #[MapRequestPayload] RegistrationChange $in): JsonResponse
    {
        $this->guard($registration->sessionFormation, $registration);
        try {
            $this->registrations->update($registration, $in->funding, $in->accessStartsOn, $in->accessEndsOn);
        } catch (EnrollmentException $e) {
            return $this->problem($e);
        }

        return $this->json($this->serialize($registration));
    }

    #[Route('/registrations/{id<\d+>}', methods: 'DELETE')]
    #[IsGranted('SOFIA_ENROLL')]
    public function cancel(Registration $registration): Response
    {
        $this->guard($registration->sessionFormation, $registration);
        $this->registrations->cancel($registration);

        return new Response(null, Response::HTTP_NO_CONTENT);
    }

    /** Removed records are gone, and a scoped account only reaches its organizations. */
    private function guard(SessionFormation $sessionFormation, ?Registration $registration = null): void
    {
        if ($sessionFormation->getDeletedAt() || $registration?->getDeletedAt()) {
            throw $this->createNotFoundException();
        }
        $this->scope->require($sessionFormation->session->organization->getId());
    }

    private function problem(EnrollmentException $e): JsonResponse
    {
        return new JsonResponse(['type' => 'about:blank', 'title' => $e->errorCode, 'code' => $e->errorCode, 'detail' => $e->getMessage(), 'status' => $e->status], $e->status, ['Content-Type' => 'application/problem+json']);
    }

    /** @return array<string, mixed> */
    private function serialize(Registration $r): array
    {
        $ps = $r->participant;

        return [
            'id' => $r->getId(), 'funding' => $r->funding,
            'accessStartsOn' => $r->accessStartsOn?->format('Y-m-d'), 'accessEndsOn' => $r->accessEndsOn?->format('Y-m-d'),
            'effectiveAccessStartsOn' => $r->getEffectiveAccessStartsOn()->format('Y-m-d'), 'effectiveAccessEndsOn' => $r->getEffectiveAccessEndsOn()->format('Y-m-d'),
            'participant' => ['id' => $ps->getId(), 'firstName' => $ps->firstName, 'lastName' => $ps->lastName, 'email' => $ps->email, 'phone' => $ps->phone, 'rpps' => $ps->rpps],
        ];
    }

    /**
     * Connected time per half-day for every PS of the classes of a session-formation. No threshold is applied:
     * the minimum presence for an attestation is still an open point.
     *
     * @return array<int, list<array<string, mixed>>> by participant id
     */
    private function attendance(int $sessionFormation): array
    {
        $rows = $this->db->fetchAllAssociative(<<<'SQL'
            WITH slots AS (
                SELECT s.id, s.virtual_class_id, c.date, ts.label, ts.start_time,
                       s.starts_at AT TIME ZONE 'Europe/Paris' AS begins, s.ends_at AT TIME ZONE 'Europe/Paris' AS ends
                FROM virtual_class_session_formation link
                JOIN virtual_class c ON c.id = link.virtual_class_id AND c.deleted_at IS NULL AND c.status <> 'CANCELLED'
                JOIN class_slot s ON s.virtual_class_id = c.id AND s.deleted_at IS NULL
                JOIN time_slot ts ON ts.id = s.time_slot_id
                WHERE link.session_formation_id = ?
            ), stream AS (
                SELECT a.slot_id, a.enrollment_id, a.at, a.event, a.person_role, s.begins, s.ends,
                       lead(a.at) OVER (PARTITION BY a.slot_id, a.connection_key ORDER BY a.at, a.id) AS next_at
                FROM slots s JOIN attendance_event a ON a.slot_id = s.id
                WHERE a.at <= now()
            ), presence AS (
                -- Clipped to the half-day; two devices at once count once.
                SELECT slot_id, enrollment_id,
                       range_agg(tstzrange(greatest(at, begins), greatest(least(coalesce(next_at, now()), ends), greatest(at, begins)), '[)')) AS intervals
                FROM stream WHERE event = 'JOIN' AND person_role = 'LEARNER'
                GROUP BY slot_id, enrollment_id
            )
            SELECT e.participant_id, s.virtual_class_id AS class_id, s.date, s.label,
                   floor(extract(epoch FROM s.ends - s.begins))::integer AS expected,
                   coalesce((SELECT floor(sum(extract(epoch FROM upper(i) - lower(i))))::integer FROM unnest(p.intervals) i), 0) AS seconds,
                   s.begins > now() AS upcoming
            FROM slots s
            JOIN enrollment e ON e.virtual_class_id = s.virtual_class_id AND e.status = 'ACTIVE'
            LEFT JOIN presence p ON p.slot_id = s.id AND p.enrollment_id = e.id
            ORDER BY s.date, s.start_time, s.id
            SQL, [$sessionFormation]);
        $byParticipant = [];
        foreach ($rows as $row) {
            $byParticipant[(int) $row['participant_id']][] = ['classId' => (int) $row['class_id'], 'date' => substr((string) $row['date'], 0, 10), 'label' => $row['label'],
                'seconds' => (int) $row['seconds'], 'expected' => (int) $row['expected'], 'upcoming' => (bool) $row['upcoming']];
        }

        return $byParticipant;
    }
}
