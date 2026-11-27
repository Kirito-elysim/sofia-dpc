<?php

namespace App\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class AttendanceSummaryController extends AbstractController
{
    #[Route('/api/live-presence/learners', methods: ['GET'])]
    #[IsGranted('SOFIA_LIVE')]
    public function __invoke(Connection $db, \App\Security\OrganizationScope $scope): JsonResponse
    {
        // Scheduling stores Paris wall-clock times. Zoom supplies absolute instants.
        $rows = $db->fetchAllAssociative(<<<SQL
            WITH slots AS (
                SELECT s.id, s.virtual_class_id, s.starts_at AT TIME ZONE 'Europe/Paris' AS start_time,
                       t.title, ts.label
                FROM class_slot s
                JOIN virtual_class c ON c.id = s.virtual_class_id
                JOIN formation t ON t.id = c.formation_id
                JOIN time_slot ts ON ts.id = s.time_slot_id
                WHERE {$scope->sql('t.organization_id')} AND c.status IN ('PLANNED', 'IN_PROGRESS')
                  AND s.starts_at <= (now() AT TIME ZONE 'Europe/Paris')
                  AND s.ends_at > (now() AT TIME ZONE 'Europe/Paris')
            ), stream AS (
                SELECT a.*, s.start_time,
                       lead(a.at) OVER device AS next_at,
                       lead(a.id) OVER device AS next_id
                FROM slots s JOIN attendance_event a ON a.slot_id = s.id
                WHERE a.at <= now()
                WINDOW device AS (PARTITION BY a.slot_id, a.connection_key ORDER BY a.at, a.id)
            ), presence AS (
                SELECT slot_id, enrollment_id,
                       range_agg(tstzrange(greatest(at, start_time), coalesce(next_at,now()), '[)')) AS intervals,
                       bool_or(next_id IS NULL) AS connected,
                       max(next_at) AS last_seen
                FROM stream
                WHERE event = 'JOIN' AND person_role = 'LEARNER'
                  AND coalesce(next_at,now()) >= start_time
                GROUP BY slot_id, enrollment_id
            )
            SELECT s.id AS "slotId", e.id AS "enrollmentId", s.title, s.label,
                   concat_ws(' ',p.first_name,p.last_name) AS name,
                   CASE WHEN a.connected THEN 'CONNECTED' WHEN a.last_seen IS NOT NULL THEN 'DISCONNECTED'
                        ELSE 'EXPECTED' END AS status,
                   coalesce((SELECT floor(sum(extract(epoch FROM upper(i)-lower(i))))::integer
                             FROM unnest(a.intervals) i),0) AS seconds,
                   CASE WHEN NOT a.connected THEN floor(extract(epoch FROM now()-a.last_seen))::integer END AS "awaySeconds"
            FROM slots s JOIN enrollment e ON e.virtual_class_id=s.virtual_class_id AND e.status='ACTIVE'
            JOIN participant p ON p.id=e.participant_id
            LEFT JOIN presence a ON a.slot_id=s.id AND a.enrollment_id=e.id
            ORDER BY s.start_time,s.id,p.last_name,p.first_name,e.id
            SQL);
        return $this->json($rows);
    }
}
