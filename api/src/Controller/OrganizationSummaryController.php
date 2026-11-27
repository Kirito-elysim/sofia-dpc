<?php

namespace App\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class OrganizationSummaryController extends AbstractController
{
    #[Route('/api/organization-summaries', methods: ['GET'])]
    #[IsGranted('SOFIA_ORGANIZATIONS')]
    public function __invoke(Connection $db, \App\Security\OrganizationScope $scope): JsonResponse
    {
        return $this->json($db->fetchAllAssociative(<<<SQL
            SELECT o.id, COALESCE(c.total, 0) AS total, COALESCE(c.learners,0) AS learners,
                (SELECT COUNT(DISTINCT e.participant_id) FROM enrollment e JOIN virtual_class v ON v.id=e.virtual_class_id JOIN formation t ON t.id=v.formation_id WHERE e.status='ACTIVE' AND {$scope->sql('v.organization_id')}) AS global_learners,
                p.details->>'address' AS address, p.details->>'zipCode' AS zip, p.details->>'city' AS city,
                p.details->>'phone' AS phone, p.details->>'email' AS email,
                EXISTS(SELECT 1 FROM organization_document d WHERE d.organization_id=o.id AND d.kind='logo' AND d.deleted_at IS NULL) AS has_logo,
                (SELECT MIN(at) FROM audit_log WHERE entity='Organization' AND entity_id=o.id AND action='CREATE') AS created,
                a.at, COALESCE(u.name, a.user_email) AS author
            FROM organization o
            LEFT JOIN organization_profile p ON p.organization_id=o.id
            LEFT JOIN (
                SELECT v.organization_id, COUNT(DISTINCT v.id) AS total, COUNT(DISTINCT e.participant_id) AS learners
                FROM virtual_class v JOIN formation t ON t.id = v.formation_id
                LEFT JOIN enrollment e ON e.virtual_class_id=v.id AND e.status='ACTIVE'
                GROUP BY v.organization_id
            ) c ON c.organization_id = o.id
            LEFT JOIN (
                SELECT DISTINCT ON (entity_id) entity_id, at, user_email
                FROM audit_log WHERE entity = 'Organization'
                ORDER BY entity_id, at DESC, id DESC
            ) a ON a.entity_id = o.id
            LEFT JOIN "user" u ON u.email = a.user_email
            WHERE o.deleted_at IS NULL AND {$scope->sql('o.id')}
            SQL));
    }
}
