<?php

namespace App\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class PlanningController extends AbstractController
{
    #[Route('/api/dashboard-overview', methods: ['GET'])]
    #[IsGranted('SOFIA_DASHBOARD')]
    public function overview(Connection $db, \App\Security\OrganizationScope $scope): JsonResponse
    {
        $scopeSql = $scope->sql('t.organization_id');
        return $this->json(['slots' => $db->fetchAllAssociative(<<<SQL
            SELECT c.id AS "classId", c.date, s.id AS "slotId", t.title, o.name AS organization
            FROM virtual_class c JOIN training t ON t.id=c.training_id JOIN organization o ON o.id=t.organization_id
            LEFT JOIN class_slot s ON s.virtual_class_id=c.id
            WHERE $scopeSql AND c.date >= CURRENT_DATE AND c.status IN ('PLANNED','IN_PROGRESS')
            ORDER BY c.date, s.starts_at, c.id
            SQL)]);
    }

    #[Route('/api/planning', methods: ['GET'])]
    #[IsGranted('SOFIA_PLANNING')]
    public function __invoke(Connection $db, \App\Security\OrganizationScope $scope): JsonResponse
    {
        $slots = $db->fetchAllAssociative(<<<SQL
            SELECT c.id AS "classId", s.id AS "slotId", c.date, c.status, c.capacity,
                   t.title, o.name AS organization, o.code AS "orgCode",
                   COALESCE(e.enrolled, 0)::integer AS enrolled, z.label AS zoom,
                   NULLIF(concat_ws(' ', f.civility, f.first_name, f.last_name), '') AS trainer,
                   COALESCE(to_char(s.starts_at, 'HH24:MI'), ts.start_time) AS "startTime",
                   COALESCE(to_char(s.ends_at, 'HH24:MI'), ts.end_time) AS "endTime",
                   s.zoom_state AS "zoomState"
            FROM virtual_class c
            JOIN training t ON t.id = c.training_id JOIN organization o ON o.id = t.organization_id
            LEFT JOIN class_slot s ON s.virtual_class_id = c.id LEFT JOIN time_slot ts ON ts.id = s.time_slot_id
            LEFT JOIN trainer f ON f.id = s.trainer_id LEFT JOIN zoom_account z ON z.id = s.zoom_account_id
            LEFT JOIN (SELECT virtual_class_id, COUNT(*) AS enrolled FROM enrollment WHERE status = 'ACTIVE' GROUP BY virtual_class_id) e ON e.virtual_class_id = c.id
            WHERE {$scope->sql('t.organization_id')}
            ORDER BY c.date, "startTime", c.id, s.id
            SQL);
        return $this->json(['slots' => $slots, 'accounts' => $scope->ids() !== null ? [] : $db->fetchFirstColumn('SELECT label FROM zoom_account WHERE active ORDER BY id')]);
    }
}
