<?php
namespace App\Command;

use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Email;
use Symfony\Component\Notifier\Message\SmsMessage;
use Symfony\Component\Notifier\TexterInterface;

#[AsCommand(name: 'app:reminders:send', description: 'Envoie les rappels programmés pour les créneaux Zoom.')]
final class SendScheduledReminders extends Command
{
    public function __construct(private Connection $db, private MailerInterface $mailer, private TexterInterface $texter)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $rows = $this->db->fetchAllAssociative(<<<'SQL'
            SELECT m.id AS template, m.name, m.channel, m.body, s.id AS slot, e.id AS enrollment,
                   p.first_name,p.last_name,p.email,p.phone,z.join_url,o.email_from,o.sms_sender,o.name AS organization,
                   concat_ws(' ',f.first_name,f.last_name) AS trainer,
                   to_char(s.starts_at,'DD/MM/YYYY') AS date,to_char(s.starts_at,'HH24:MI') AS hour
            FROM message_template m
            JOIN class_slot s ON s.starts_at BETWEEN
                (now() AT TIME ZONE 'Europe/Paris') + make_interval(mins=>m.minutes_before) - interval '2 minutes'
                AND (now() AT TIME ZONE 'Europe/Paris') + make_interval(mins=>m.minutes_before)
            JOIN virtual_class c ON c.id=s.virtual_class_id
            JOIN formation t ON t.id=c.formation_id JOIN organization o ON o.id=t.organization_id
            JOIN enrollment e ON e.virtual_class_id=c.id AND e.status='ACTIVE'
            JOIN participant p ON p.id=e.participant_id LEFT JOIN trainer f ON f.id=s.trainer_id
            LEFT JOIN zoom_registration z ON z.enrollment_id=e.id AND z.slot_id=s.id AND z.state='approved'
            WHERE m.active AND c.status IN ('PLANNED','IN_PROGRESS') AND m.organization IN ('Tous',o.name)
              AND (m.minutes_before=0 OR s.starts_at > now() AT TIME ZONE 'Europe/Paris')
              AND (m.channel!='SMS' OR extract(hour FROM now() AT TIME ZONE 'Europe/Paris') BETWEEN 8 AND 19)
              AND NOT EXISTS (SELECT FROM reminder_delivery d WHERE (d.template_id,d.slot_id,d.enrollment_id)=(m.id,s.id,e.id))
              AND CASE m.presence_rule WHEN 'ALL' THEN true WHEN 'NEVER_JOINED' THEN NOT EXISTS (
                  SELECT FROM attendance_event WHERE slot_id=s.id AND enrollment_id=e.id AND event='JOIN' AND at<=now()
              ) ELSE (m.presence_rule='CONNECTED') = EXISTS (
                  SELECT FROM (SELECT DISTINCT ON (connection_key) enrollment_id,event FROM attendance_event
                      WHERE slot_id=s.id AND at<=now() ORDER BY connection_key,at DESC,id DESC) devices
                  WHERE devices.enrollment_id=e.id AND devices.event='JOIN'
              ) END
            SQL);
        foreach ($rows as $r) {
            $key = [(int)$r['template'],(int)$r['slot'],(int)$r['enrollment']];
            $recipient = (string) ('SMS' === $r['channel'] ? $r['phone'] : $r['email']);
            // Persist the claim before contacting the transport. An ambiguous delivery must not be repeated.
            $log = $this->db->transactional(function (Connection $db) use ($key,$r,$recipient) {
                if (!$db->executeStatement('INSERT INTO reminder_delivery(template_id,slot_id,enrollment_id) VALUES (?,?,?) ON CONFLICT DO NOTHING',$key)) {
                    return null;
                }
                $id = $db->fetchOne("INSERT INTO message_log(at,enrollment_id,channel,kind,recipient,status) VALUES (now(),?,?, 'SCHEDULED_REMINDER',?, 'PENDING') RETURNING id",
                    [$key[2],$r['channel']==='SMS'?'SMS':'MAIL',$recipient]);
                $db->executeStatement('UPDATE reminder_delivery SET message_log_id=? WHERE template_id=? AND slot_id=? AND enrollment_id=?',[$id,...$key]);
                return $id;
            });
            if (!$log) { continue; }
            $error = null;
            try {
                $body = strtr($r['body'], ['{prenom}'=>$r['first_name'],'{nom}'=>$r['last_name'],'{date}'=>$r['date'],'{heure}'=>$r['hour'],
                    '{organisme}'=>$r['organization'],'{formateur}'=>$r['trainer'],'{lien}'=>$r['join_url']??'']);
                if (str_contains($r['body'],'{lien}') && !$r['join_url']) { throw new \DomainException('Lien de participation indisponible.'); }
                if ('SMS' === $r['channel']) {
                    if (!$recipient || mb_strlen($body)>=160) { throw new \DomainException('Téléphone manquant ou SMS personnalisé trop long.'); }
                    $this->texter->send(new SmsMessage($recipient,$body,$r['sms_sender']??''));
                } else {
                    $this->mailer->send((new Email())->from($r['email_from'])->to($recipient)->subject($r['name'])->text($body));
                }
            } catch (\Throwable $e) {
                $error = $e instanceof \DomainException ? $e->getMessage() : 'Transmission impossible. Vérifier le transport du canal.';
            }
            $this->db->update('message_log',['status'=>$error?'FAILED':'SENT','error'=>$error],['id'=>$log]);
        }
        return Command::SUCCESS;
    }
}
