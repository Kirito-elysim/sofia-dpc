<?php

namespace App\Controller;

use App\Entity\{AuditLog, Enrollment, Participant};
use App\Enum\{ClassStatus, EnrollmentStatus};
use App\Message\SendEnrollmentConfirmation;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{JsonResponse, Request};
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class OperationsController extends AbstractController
{
    #[Route('/health', methods: ['GET'])]
    public function health(Connection $db): JsonResponse
    {
        try { $db->fetchOne('SELECT 1'); }
        catch (\Doctrine\DBAL\Exception) { return $this->json(['status' => 'unavailable'], 503); }
        return $this->json(['status' => 'ok']);
    }

    #[Route('/api/audit', methods: ['GET'])]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function audit(Request $request, Connection $db): JsonResponse
    {
        $before = max(0, $request->query->getInt('before'));
        $entries = $db->fetchAllAssociative('SELECT id, at, ip, user_email AS author, action, entity, entity_id AS "entityId", label
            FROM audit_log '.($before ? 'WHERE id < ? ' : '').'ORDER BY id DESC LIMIT 51', $before ? [$before] : []);
        $page = array_slice($entries, 0, 50);
        return $this->json(['entries' => $page, 'next' => count($entries) > 50 ? end($page)['id'] : null]);
    }

    #[Route('/api/audit/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function auditEvent(int $id, Connection $db): JsonResponse
    {
        $row = $db->fetchAssociative('SELECT data, request FROM audit_log WHERE id = ?', [$id]);
        if (!$row) {
            throw $this->createNotFoundException();
        }

        return $this->json(['data' => json_decode($row['data'], true), 'request' => json_decode($row['request'] ?? 'null', true)]);
    }

    #[Route('/api/learners', methods: ['GET'])]
    #[IsGranted('SOFIA_LEARNERS')]
    public function learners(Request $request, Connection $db, \App\Security\OrganizationScope $scope): JsonResponse
    {
        $before = max(0, $request->query->getInt('before'));
        $search = mb_strtolower(trim($request->query->getString('q')));
        $rows = $db->fetchAllAssociative("SELECT id, first_name, last_name, email FROM participant
            WHERE ({$scope->sql('NULL')} OR EXISTS (SELECT 1 FROM enrollment e JOIN virtual_class c ON c.id=e.virtual_class_id JOIN formation t ON t.id=c.formation_id WHERE e.participant_id=participant.id AND {$scope->sql('c.organization_id')}) OR EXISTS (SELECT 1 FROM registration r JOIN session_formation sf ON sf.id=r.session_formation_id JOIN session se ON se.id=sf.session_id WHERE r.participant_id=participant.id AND {$scope->sql('se.organization_id')})) AND position(? in lower(first_name || ' ' || last_name || ' ' || email)) > 0 "
            .($before ? 'AND id < ? ' : '').'ORDER BY id DESC LIMIT 51', $before ? [$search, $before] : [$search]);
        $page = array_slice($rows, 0, 50);
        return $this->json(['entries' => $page, 'next' => count($rows) > 50 ? end($page)['id'] : null]);
    }

    #[Route('/api/learners/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    #[IsGranted('SOFIA_LEARNERS')]
    public function learner(Participant $learner, Connection $db, \App\Security\OrganizationScope $scope): JsonResponse
    {
        return $this->json(['name' => $learner->firstName.' '.$learner->lastName, 'email' => $learner->email, 'phone' => $learner->phone,
            'classes' => $db->fetchAllAssociative('SELECT e.id, c.id AS "classId", t.title, c.date, e.status, c.status AS "classStatus"
                FROM enrollment e JOIN virtual_class c ON c.id=e.virtual_class_id JOIN formation t ON t.id=c.formation_id
                WHERE e.participant_id=? AND '.$scope->sql('c.organization_id').' ORDER BY c.date DESC,e.id DESC', [$learner->getId()]),
            'messages' => $db->fetchAllAssociative('SELECT m.id,m.at,m.channel,m.kind,m.status,m.sent_by AS author,t.title
                FROM message_log m JOIN enrollment e ON m.enrollment_id=e.id JOIN virtual_class c ON c.id=e.virtual_class_id
                JOIN formation t ON t.id=c.formation_id WHERE e.participant_id=? AND '.$scope->sql('c.organization_id').' ORDER BY m.at DESC,m.id DESC', [$learner->getId()])]);
    }

    #[Route('/api/enrollments/{id}/relance', methods: ['POST'])]
    #[IsGranted('SOFIA_REMIND')]
    #[IsGranted('SOFIA_LEARNERS')]
    public function remind(Enrollment $enrollment, MessageBusInterface $bus, EntityManagerInterface $em): JsonResponse
    {
        if (EnrollmentStatus::ACTIVE !== $enrollment->status || !in_array($enrollment->virtualClass->status, [ClassStatus::PLANNED, ClassStatus::IN_PROGRESS], true)) {
            return $this->json(['detail' => 'Cette inscription ne permet plus de relance.'], 409);
        }
        $actor = $this->getUser()?->getUserIdentifier();
        $bus->dispatch(new SendEnrollmentConfirmation($enrollment->getId() ?? throw new \LogicException(), $actor, true));
        $em->persist(new AuditLog($actor, 'MANUAL_REMINDER', 'Enrollment', $enrollment->getId()));
        $em->flush();
        return $this->json(['state' => 'queued'], 202);
    }
}
