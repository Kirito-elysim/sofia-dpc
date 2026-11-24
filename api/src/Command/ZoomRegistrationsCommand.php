<?php
namespace App\Command;

use App\Entity\ZoomAccount;
use App\Zoom\ZoomGateway;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand('app:zoom:registrations','Synchronise les inscriptions nominatives des apprenants par créneau.')]
final class ZoomRegistrationsCommand extends Command
{
    public function __construct(private EntityManagerInterface $em,private ZoomGateway $zoom) { parent::__construct(); }
    protected function execute(InputInterface $input,OutputInterface $output): int
    {
        $db=$this->em->getConnection();
        $db->executeStatement("INSERT INTO zoom_registration(slot_id,enrollment_id,state)
            SELECT s.id,e.id,'queued' FROM enrollment e JOIN class_slot s ON s.virtual_class_id=e.virtual_class_id
            JOIN virtual_class c ON c.id=e.virtual_class_id
            WHERE e.status='ACTIVE' AND c.status IN ('PLANNED','IN_PROGRESS') AND s.zoom_state='ready'
            AND s.ends_at>now() AT TIME ZONE 'Europe/Paris' ON CONFLICT DO NOTHING");
        $rows=$db->fetchAllAssociative("SELECT z.*,s.meeting_number,s.zoom_account_id,p.email,p.first_name,p.last_name,
            (e.status!='ACTIVE' OR c.status='CANCELLED') AS cancel
            FROM zoom_registration z JOIN enrollment e ON e.id=z.enrollment_id JOIN participant p ON p.id=e.participant_id
            JOIN class_slot s ON s.id=z.slot_id JOIN virtual_class c ON c.id=s.virtual_class_id
            WHERE s.ends_at>now() AT TIME ZONE 'Europe/Paris' AND ((z.state='queued' AND e.status='ACTIVE' AND c.status IN ('PLANNED','IN_PROGRESS'))
            OR (z.state IN ('approved','pending') AND z.registrant_id IS NOT NULL AND (e.status!='ACTIVE' OR c.status='CANCELLED')))");
        $failed=false;
        foreach ($rows as $r) {
            $keys=[$r['slot_id'],$r['enrollment_id']];
            if (!$db->executeStatement("UPDATE zoom_registration SET state='processing' WHERE slot_id=? AND enrollment_id=? AND state=?", [...$keys,$r['state']])) { continue; }
            try {
                $account=$this->em->find(ZoomAccount::class,$r['zoom_account_id'])??throw new \RuntimeException();
                if ($r['cancel']) {
                    $this->zoom->cancelRegistration($account,$r['meeting_number'],$r['registrant_id'],$r['email']);
                    $db->executeStatement("UPDATE zoom_registration SET state='revoked',join_url=NULL WHERE slot_id=? AND enrollment_id=? AND state='processing'",$keys);
                } else {
                    [$id,$url]=$this->zoom->register($account,$r['meeting_number'],$r['first_name'],$r['last_name'],$r['email']);
                    $db->executeStatement("UPDATE zoom_registration SET state='approved',registrant_id=?,join_url=? WHERE slot_id=? AND enrollment_id=?
                        AND (state='processing' OR (state='approved' AND registrant_id=?))",[$id,$url,...$keys,$id]);
                }
            } catch (\Throwable) {
                $db->executeStatement("UPDATE zoom_registration SET state='review' WHERE slot_id=? AND enrollment_id=? AND state='processing'",$keys);
                $output->writeln('Inscription Zoom à vérifier pour le créneau '.$r['slot_id'].' et l’inscription '.$r['enrollment_id'].'.');
                $failed=true;
            }
        }
        return $failed?Command::FAILURE:Command::SUCCESS;
    }
}
