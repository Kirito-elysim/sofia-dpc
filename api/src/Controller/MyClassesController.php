<?php

namespace App\Controller;

use App\Entity\ClassSlot;
use App\Entity\User;
use App\Enum\ClassStatus;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

class MyClassesController extends AbstractController
{
    /** Upcoming (today included) half-days of the logged-in trainer, soonest first. */
    #[Route('/api/me/classes', methods: 'GET')]
    public function __invoke(#[CurrentUser] User $user, EntityManagerInterface $em): JsonResponse
    {
        if (!$user->hasTrainerAccess()) {
            throw $this->createAccessDeniedException();
        }
        // Own slots are visible whatever organizations the account manages.
        if ($em->getFilters()->isEnabled('organization_scope')) {
            $em->getFilters()->disable('organization_scope');
        }
        /** @var list<ClassSlot> $slots */
        $slots = $em->createQuery('SELECT s, c, ts FROM '.ClassSlot::class.' s JOIN s.virtualClass c JOIN s.timeSlot ts
            WHERE s.trainer = :t AND c.date >= :today AND c.status != :cancelled ORDER BY c.date, ts.startTime')
            ->setParameters(['t' => $user->trainer, 'today' => new \DateTimeImmutable('today'), 'cancelled' => ClassStatus::CANCELLED])
            ->getResult();

        return $this->json(array_map(static fn (ClassSlot $s) => [
            'id' => $s->getId(),
            'zoomUrl' => 'ready' === $s->zoomState && $s->zoomAccount?->active && ClassStatus::DONE !== $s->virtualClass->status && preg_match('/^[0-9]{9,11}$/D', $s->meetingNumber ?? '')
                ? 'https://zoom.us/j/'.$s->meetingNumber : null,
            'classId' => $s->virtualClass->getId(),
            'date' => $s->virtualClass->date->format('Y-m-d'),
            'formation' => $s->virtualClass->formation->title,
            'organization' => $s->virtualClass->getOrganization()->code,
            'status' => $s->virtualClass->status->value,
            'slot' => $s->timeSlot->label,
            'startTime' => $s->timeSlot->startTime,
            'endTime' => $s->timeSlot->endTime,
        ], $slots));
    }
}
