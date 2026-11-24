<?php

namespace App\Message;

use App\Entity\Enrollment;
use App\Entity\MessageLog;
use App\Enum\EnrollmentStatus;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;
use Twig\Environment;

#[AsMessageHandler]
final class SendEnrollmentConfirmationHandler
{
    public function __construct(
        private EntityManagerInterface $em,
        private MailerInterface $mailer,
        private Environment $twig,
    ) {
    }

    public function __invoke(SendEnrollmentConfirmation $message): void
    {
        $enrollment = $this->em->find(Enrollment::class, $message->enrollmentId);
        // State is re-read at send time: a cancelled enrollment gets no mail.
        if (null === $enrollment || EnrollmentStatus::ACTIVE !== $enrollment->status) {
            return;
        }

        $class = $enrollment->virtualClass;
        $org = $class->getOrganization();
        $ps = $enrollment->participant;
        $ctx = ['ps' => $ps, 'class' => $class, 'org' => $org, 'enrollment' => $enrollment];

        $email = (new Email())
            ->from(new Address($org->emailFrom, $org->name))
            ->to(new Address($ps->email, $ps->firstName.' '.mb_strtoupper($ps->lastName)))
            ->subject(sprintf('%s — Confirmation de votre inscription', $org->name))
            ->text($this->twig->render('email/enrollment_confirmation.txt.twig', $ctx))
            ->html($this->twig->render('email/enrollment_confirmation.html.twig', $ctx));

        try {
            $this->mailer->send($email);
            $this->em->persist(new MessageLog($enrollment, 'MAIL', 'ENROLLMENT_CONFIRMATION', $ps->email, 'SENT', null, $message->sentBy));
        } catch (TransportExceptionInterface $e) {
            $this->em->persist(new MessageLog($enrollment, 'MAIL', 'ENROLLMENT_CONFIRMATION', $ps->email, 'FAILED', $e->getMessage(), $message->sentBy));
            $this->em->flush();
            throw $e; // Messenger retries (3 attempts, backoff), see messenger.yaml.
        }
        $this->em->flush();
    }
}
