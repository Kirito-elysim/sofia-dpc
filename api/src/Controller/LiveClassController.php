<?php
namespace App\Controller;

use App\Entity\{AuditLog,ClassSlot,Enrollment,MessageLog};
use App\Enum\{ClassStatus,EnrollmentStatus};
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{JsonResponse,Request};
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Email;
use Symfony\Component\Notifier\Message\SmsMessage;
use Symfony\Component\Notifier\TexterInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class LiveClassController extends AbstractController
{
    #[Route('/api/live-presence/classes',methods:['GET'])]
    #[IsGranted('SOFIA_LIVE')]
    public function classes(Connection $db, \App\Security\OrganizationScope $scope): JsonResponse
    {
        $rows=$db->fetchAllAssociative(<<<SQL
            WITH slots AS (
                SELECT s.*,t.title FROM class_slot s JOIN virtual_class c ON c.id=s.virtual_class_id JOIN formation t ON t.id=c.formation_id
                WHERE {$scope->sql('c.organization_id')} AND c.status IN ('IN_PROGRESS','PLANNED') AND s.ends_at>now() AT TIME ZONE 'Europe/Paris'
                  AND s.starts_at<=(now() AT TIME ZONE 'Europe/Paris')+interval '30 minutes'
            ), devices AS (
                SELECT DISTINCT ON (a.slot_id,a.connection_key) a.* FROM attendance_event a JOIN slots s ON s.id=a.slot_id
                WHERE a.at<=now() ORDER BY a.slot_id,a.connection_key,a.at DESC,a.id DESC
            ), arrivals AS (
                SELECT DISTINCT a.slot_id,a.enrollment_id FROM attendance_event a JOIN slots s ON s.id=a.slot_id
                WHERE a.event='JOIN' AND a.person_role='LEARNER' AND a.at<=now()
            )
            SELECT s.id,s.title,extract(epoch FROM s.starts_at AT TIME ZONE 'Europe/Paris')::bigint*1000 AS start,
              extract(epoch FROM s.ends_at-s.starts_at)::int/60 AS duration,
              concat_ws(' ',f.first_name,f.last_name) AS trainer,f.email AS trainer_email,f.phone AS trainer_phone,
              EXISTS(SELECT FROM devices d WHERE d.slot_id=s.id AND d.person_role='TRAINER' AND d.event='JOIN') AS trainer_connected,
              e.id AS enrollment,z.join_url,p.first_name,p.last_name,p.email,p.phone,
              CASE WHEN EXISTS(SELECT FROM devices d WHERE d.slot_id=s.id AND d.enrollment_id=e.id AND d.event='JOIN') THEN 'connected'
                   WHEN a.enrollment_id IS NOT NULL THEN 'left' ELSE 'waiting' END AS state
            FROM slots s LEFT JOIN trainer f ON f.id=s.trainer_id
            LEFT JOIN enrollment e ON e.virtual_class_id=s.virtual_class_id AND e.status='ACTIVE'
            LEFT JOIN participant p ON p.id=e.participant_id LEFT JOIN arrivals a ON a.slot_id=s.id AND a.enrollment_id=e.id
            LEFT JOIN zoom_registration z ON z.enrollment_id=e.id AND z.slot_id=s.id AND z.state='approved'
            ORDER BY s.starts_at,s.id,p.last_name,p.first_name,e.id
            SQL);
        $classes=[];
        foreach ($rows as $r) {
            $classes[$r['id']] ??= ['id'=>(string)$r['id'],'title'=>$r['title'],'start'=>(int)$r['start'],'durationMin'=>(int)$r['duration'],
                'trainer'=>$r['trainer'] ?: 'Formateur non affecté','trainerConnected'=>(bool)$r['trainer_connected'],
                'trainerContact'=>['email'=>$r['trainer_email'],'phone'=>$r['trainer_phone']],'participants'=>[]];
            if ($r['enrollment']) {
                $classes[$r['id']]['participants'][]=['id'=>(string)$r['enrollment'],'name'=>trim($r['first_name'].' '.$r['last_name']),
                    'phone'=>$r['phone'],'email'=>$r['email'],'state'=>$r['state'],'joinUrl'=>$r['join_url']];
            }
        }
        return $this->json(array_values($classes));
    }

    #[Route('/api/live-presence/classes/{id}/contact',methods:['POST'])]
    #[IsGranted('SOFIA_REMIND')]
    #[IsGranted('SOFIA_LIVE')]
    public function contact(ClassSlot $slot,Request $request,EntityManagerInterface $em,MailerInterface $mailer,#[\Symfony\Component\DependencyInjection\Attribute\AutowireServiceClosure(TexterInterface::class)] \Closure $sms): JsonResponse
    {
        $data=$request->toArray();
        $target=$data['target']??'';
        $channel=$data['channel']??'';
        $body=$data['body']??null;
        if (!is_string($body) || ''===trim($body) || mb_strlen($body)>5000 || !in_array($channel,['SMS','MAIL'],true)) {
            return $this->json(['detail'=>'Message ou canal invalide.'],422);
        }
        $now=new \DateTimeImmutable('now',new \DateTimeZone('Europe/Paris'));
        $localNow=$now->format('Y-m-d H:i:s');
        if (!$slot->startsAt || !$slot->endsAt || $slot->endsAt->format('Y-m-d H:i:s')<=$localNow ||
            $slot->startsAt->format('Y-m-d H:i:s')>$now->modify('+30 minutes')->format('Y-m-d H:i:s') ||
            !in_array($slot->virtualClass->status,[ClassStatus::PLANNED,ClassStatus::IN_PROGRESS],true)) {
            return $this->json(['detail'=>'Ce créneau est hors du suivi en direct.'],409);
        }
        $enrollment=null;
        if ('trainer'===$target) { $person=$slot->trainer; }
        else {
            $enrollment=is_string($target)&&ctype_digit($target)?$em->find(Enrollment::class,(int)$target):null;
            if (!$enrollment || $enrollment->virtualClass!==$slot->virtualClass || EnrollmentStatus::ACTIVE!==$enrollment->status) {
                return $this->json(['detail'=>'Inscription introuvable pour cette classe.'],404);
            }
            $person=$enrollment->participant;
        }
        $recipient='MAIL'===$channel?$person?->email:$person?->phone;
        if (!$recipient) { return $this->json(['detail'=>'Coordonnées manquantes.'],422); }
        if ($channel==='SMS' && ((int)$now->format('H')<8 || (int)$now->format('H')>=20)) {
            return $this->json(['detail'=>'Envoi de SMS disponible entre 8 h et 20 h.'],422);
        }
        $org=$slot->virtualClass->getOrganization();
        $status='SENT';
        try {
            if ('MAIL'===$channel) {
                $mailer->send((new Email())->from($org->emailFrom)->to($recipient)->subject('Classe virtuelle · '.$slot->virtualClass->formation->title)->text($body));
            } else { $sms()->send(new SmsMessage($recipient,$body,$org->smsSender??'')); }
        } catch (\Exception) { $status='FAILED'; }
        $actor=$this->getUser()?->getUserIdentifier();
        if ($enrollment) { $em->persist(new MessageLog($enrollment,$channel,'LIVE_CONTACT',$recipient,$status,null,$actor)); }
        $em->persist(new AuditLog($actor,'LIVE_CONTACT','ClassSlot',$slot->getId(),['target'=>$target,'channel'=>$channel,'status'=>$status]));
        $em->flush();
        return $status==='SENT'?$this->json(['status'=>$status]):$this->json(['detail'=>'Le transport a échoué. Vérifiez le journal avant toute nouvelle tentative.'],502);
    }
}
