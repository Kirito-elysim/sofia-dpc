<?php

namespace App\Message;

use App\Entity\{Training, User};
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;

#[AsMessageHandler]
final class ZoomCapacityAlertHandler
{
    public function __construct(private EntityManagerInterface $em, private MailerInterface $mailer) {}

    public function __invoke(ZoomCapacityAlert $alert): void
    {
        $training = $this->em->find(Training::class, $alert->trainingId);
        if (!$training) { return; }
        $admins = array_filter($this->em->getRepository(User::class)->findBy(['active' => true]),
            static fn (User $u) => $u->getRole() === 'ROLE_SUPER_ADMIN' || (
                in_array('SCHEDULE', \App\Security\Permissions::forUser($u), true)
                && ($u->organizations->contains($training->organization) || ($u->organizations->isEmpty() && $u->organization === $training->organization))
            ));
        if (!$admins) { return; }
        $this->mailer->send((new Email())->from($training->organization->emailFrom)
            ->bcc(...array_values(array_map(static fn (User $u) => $u->email, $admins)))
            ->subject('SOFIA — Aucun compte Zoom disponible')
            ->text(sprintf("Réservation bloquée pour %s, le %s (%s).", $training->title, $alert->day, $alert->slot)));
    }
}
