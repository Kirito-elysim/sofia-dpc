<?php

namespace App\Controller;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\{JsonResponse, Request, Response};
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class ZoomPresenceController extends AbstractController
{
    /** @param array<string,array<string,string>> $profiles */
    public function __construct(#[Autowire('%env(json:ZOOM_PROFILES)%')] private array $profiles) {}

    #[Route('/webhooks/zoom/oauth', methods: ['POST'])]
    public function oauth(Request $request,Connection $db,\App\Zoom\ZoomOAuth $oauth): Response
    {
        $secret=$db->fetchOne('SELECT webhook_secret FROM zoom_oauth_app WHERE id=1');
        if (!$secret) { return new Response('',401); }
        return $this->handle($request,$db,$oauth->open($secret),null,null);
    }

    #[Route('/webhooks/zoom/{id}', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function receive(int $id, Request $request, Connection $db): Response
    {
        $profile = $db->fetchOne('SELECT profile FROM zoom_account WHERE id=? AND oauth_connection_id IS NULL', [$id]);
        $config = $this->profiles[$profile] ?? [];
        return $this->handle($request,$db,$config['webhook_secret']??'', $config['account_id']??null,$id);
    }

    private function handle(Request $request,Connection $db,string $secret,?string $account,?int $id): Response
    {
        $ts = $request->headers->get('x-zm-request-timestamp', '');
        if (!$secret || !ctype_digit($ts) || abs(time() - (int) $ts) > 300 ||
            !hash_equals('v0='.hash_hmac('sha256', 'v0:'.$ts.':'.$request->getContent(), $secret), $request->headers->get('x-zm-signature', ''))) {
            return new Response('', 401);
        }
        $data = $request->toArray();
        $payload = $data['payload'] ?? [];
        $event = $data['event'] ?? '';
        if ('endpoint.url_validation' === $event) {
            $plain = $payload['plainToken'] ?? null;
            if (!is_string($plain) || '' === $plain) { return new Response('', 400); }
            return $this->json(['plainToken' => $plain, 'encryptedToken' => hash_hmac('sha256', $plain, $secret)]);
        }
        $source=$payload['account_id']??null;
        if (!is_string($source) || $source==='' || ($id!==null && $account!==$source)) { return new Response('',403); }
        $registrationStates=['meeting.registration_created'=>'pending','meeting.registration_approved'=>'approved',
            'meeting.registration_cancelled'=>'cancelled','meeting.registration_denied'=>'denied'];
        if (!isset($registrationStates[$event]) && !in_array($event,['meeting.participant_joined','meeting.participant_left'],true)) { return new Response('',204); }
        $object = $payload['object'] ?? [];
        $p = $object['participant'] ?? [];
        if ($id===null) {
            $id=$db->fetchOne('SELECT s.zoom_account_id FROM class_slot s JOIN zoom_account h ON h.id=s.zoom_account_id
                JOIN zoom_oauth_connection c ON c.id=h.oauth_connection_id WHERE c.account_id=? AND s.meeting_number=?',
                [$source,(string)($object['id']??'')]);
            if (!$id) { return new Response('',204); }
        }
        $slot = $db->fetchAssociative('SELECT s.id, s.virtual_class_id, t.email AS trainer_email, u.email AS login_email
            FROM class_slot s LEFT JOIN trainer t ON t.id=s.trainer_id LEFT JOIN "user" u ON u.trainer_id=t.id
            WHERE s.zoom_account_id=? AND s.meeting_number=?', [$id, (string) ($object['id'] ?? '')]);
        if (!$slot) { return new Response('', 204); }
        if (isset($registrationStates[$event])) {
            $reg=$object['registrant']??[];
            $rid=$reg['id']??null;
            $stamp=$data['event_ts']??null;
            if (!is_string($rid) || $rid==='' || !is_int($stamp) || $stamp<=0) { return new Response('',400); }
            $state=$registrationStates[$event];
            if ($event==='meeting.registration_created' && ($reg['status']??'')==='approved') { $state='approved'; }
            $email=mb_strtolower(trim((string)($reg['email']??'')));
            $existing=$db->fetchOne('SELECT enrollment_id FROM zoom_registration WHERE slot_id=? AND registrant_id=?',[$slot['id'],$rid]);
            $enrollment=$existing ?: $db->fetchOne("SELECT e.id FROM enrollment e JOIN participant p ON p.id=e.participant_id
                WHERE e.virtual_class_id=? AND e.status='ACTIVE' AND lower(p.email)=?",[$slot['virtual_class_id'],$email]);
            if (!$enrollment) { return new Response('',204); }
            $url=$state==='approved' && \App\Zoom\ZoomGateway::validJoinUrl($reg['join_url']??null)?$reg['join_url']:null;
            $db->executeStatement("INSERT INTO zoom_registration(slot_id,enrollment_id,registrant_id,join_url,state,event_ts) VALUES (?,?,?,?,?,?)
                ON CONFLICT(slot_id,enrollment_id) DO UPDATE SET registrant_id=excluded.registrant_id,state=excluded.state,event_ts=excluded.event_ts,
                join_url=CASE WHEN excluded.state='approved' THEN coalesce(excluded.join_url,zoom_registration.join_url) END
                WHERE zoom_registration.event_ts<excluded.event_ts AND (zoom_registration.registrant_id IS NULL OR zoom_registration.registrant_id=excluded.registrant_id)",
                [$slot['id'],$enrollment,$rid,$url,$state,$stamp]);
            return new Response('',204);
        }
        $joined = 'meeting.participant_joined' === $event;
        $time = $p[$joined ? 'join_time' : 'leave_time'] ?? null;
        $device = (string) ($p['participant_uuid'] ?? $p['user_id'] ?? '');
        if (!$device || !is_string($time) || !preg_match('/^\d{4}-\d{2}-\d{2}T/', $time)) { return new Response('', 400); }
        try { $at = (new \DateTimeImmutable($time))->format(DATE_ATOM); }
        catch (\Exception) { return new Response('', 400); }
        $email = mb_strtolower(trim((string) ($p['email'] ?? '')));
        $trainer = '' !== $email && in_array($email, [mb_strtolower($slot['trainer_email'] ?? ''),mb_strtolower($slot['login_email'] ?? '')], true);
        $enrollment = !$trainer && $email ? $db->fetchOne("SELECT e.id FROM enrollment e JOIN participant p ON p.id=e.participant_id WHERE e.virtual_class_id=? AND e.status='ACTIVE' AND lower(p.email)=?", [$slot['virtual_class_id'], $email]) : false;
        if (!$trainer && !empty($p['registrant_id'])) {
            $enrollment=$db->fetchOne("SELECT z.enrollment_id FROM zoom_registration z JOIN enrollment e ON e.id=z.enrollment_id
                WHERE z.slot_id=? AND z.registrant_id=? AND e.status='ACTIVE'",[$slot['id'],$p['registrant_id']]);
        }
        $identity = hash('sha256', ($object['uuid'] ?? '').'|'.$device);
        $key = hash('sha256', implode('|', [$slot['id'], $identity, $event, $at]));
        $db->executeStatement('INSERT INTO attendance_event (event_key,slot_id,connection_key,at,event,person_role,enrollment_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT (event_key) DO NOTHING',
            [$key,$slot['id'],$identity,$at,$joined?'JOIN':'LEAVE',$trainer?'TRAINER':($enrollment?'LEARNER':'UNKNOWN'),$enrollment?:null]);
        return new Response('', 204);
    }

    #[Route('/api/live-presence', methods: ['GET'])]
    #[IsGranted('SOFIA_LIVE')]
    public function live(Connection $db, \App\Security\OrganizationScope $scope): JsonResponse
    {
        $rows = $db->fetchAllAssociative("SELECT a.id,a.at,a.event,a.person_role AS role,t.title,ts.label,
            CASE WHEN a.person_role='TRAINER' THEN concat_ws(' ',f.first_name,f.last_name)
                 WHEN a.person_role='LEARNER' THEN concat_ws(' ',p.first_name,p.last_name) END AS name
            FROM attendance_event a JOIN class_slot s ON s.id=a.slot_id JOIN virtual_class c ON c.id=s.virtual_class_id
            JOIN formation t ON t.id=c.formation_id JOIN time_slot ts ON ts.id=s.time_slot_id LEFT JOIN trainer f ON f.id=s.trainer_id
            LEFT JOIN enrollment e ON e.id=a.enrollment_id LEFT JOIN participant p ON p.id=e.participant_id
            WHERE {$scope->sql('c.organization_id')} ORDER BY a.at DESC,a.id DESC LIMIT 100");
        return $this->json($rows);
    }
}
