<?php

namespace App\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

class TimeSlotUsageController extends AbstractController
{
    /** Ids of the time slots already used by a class: they can be disabled, not deleted. */
    #[Route('/api/time-slot-usage', methods: 'GET')]
    #[IsGranted('SOFIA_TIME_SLOTS')]
    public function __invoke(Connection $db): JsonResponse
    {
        return $this->json(array_map('intval', $db->fetchFirstColumn('SELECT DISTINCT time_slot_id FROM class_slot ORDER BY time_slot_id')));
    }
}
