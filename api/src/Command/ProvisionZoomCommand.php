<?php

namespace App\Command;

use App\Entity\{AuditLog, ClassSlot};
use App\Zoom\ZoomGateway;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand('app:zoom:provision', 'Crée les réunions des créneaux réservés en attente.')]
final class ProvisionZoomCommand extends Command
{
    public function __construct(private EntityManagerInterface $em, private ZoomGateway $zoom) { parent::__construct(); }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $db = $this->em->getConnection();
        $failed = false;
        while (false !== ($id = $db->fetchOne("UPDATE class_slot SET zoom_state = 'processing'
            WHERE id = (SELECT id FROM class_slot WHERE zoom_state = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
            RETURNING id"))) {
            $slot = $this->em->find(ClassSlot::class, (int) $id);
            if (!$slot) { continue; }
            try {
                $slot->meetingNumber = $this->zoom->createMeeting($slot);
                $slot->zoomState = ($slot->zoomPolicy['effective']['registration'] ?? null) === false ? 'review' : 'ready';
                $failed = $failed || $slot->zoomState === 'review';
            } catch (\Throwable) {
                // A timeout after a successful remote POST must not create another meeting.
                $slot->zoomState = 'review';
                $failed = true;
                $output->writeln(sprintf('<error>Créneau %d : vérifier le résultat dans Zoom avant toute reprise.</error>', $id));
            }
            $this->em->persist(new AuditLog(null, 'ZOOM_PROVISION', 'ClassSlot', (int) $id, ['state' => $slot->zoomState]));
            $this->em->flush();
            $this->em->clear();
        }
        return $failed ? Command::FAILURE : Command::SUCCESS;
    }
}
