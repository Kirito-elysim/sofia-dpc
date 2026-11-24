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
    #[IsGranted('ROLE_LECTURE')]
    public function __invoke(Connection $db): JsonResponse
    {
        return $this->json($db->fetchAllAssociative(<<<'SQL'
            SELECT o.id, COALESCE(c.total, 0) AS total, a.at, COALESCE(u.name, a.user_email) AS author
            FROM organization o
            LEFT JOIN (
                SELECT t.organization_id, COUNT(*) AS total
                FROM virtual_class v JOIN training t ON t.id = v.training_id
                GROUP BY t.organization_id
            ) c ON c.organization_id = o.id
            LEFT JOIN (
                SELECT DISTINCT ON (entity_id) entity_id, at, user_email
                FROM audit_log WHERE entity = 'Organization'
                ORDER BY entity_id, at DESC, id DESC
            ) a ON a.entity_id = o.id
            LEFT JOIN "user" u ON u.email = a.user_email
            SQL));
    }
}
