<?php

namespace App\Service;

use App\Entity\AuditLog;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Email;

final class AccessMailer
{
    public function __construct(
        private MailerInterface $mailer,
        #[Autowire('%env(SOFIA_FRONT_URL)%')] private string $baseUrl,
        #[Autowire('%env(MAILER_DSN)%')] private string $mailerDsn,
        private EntityManagerInterface $em,
        private UserPasswordHasherInterface $hasher,
        private Security $security,
    ) {
    }

    /** Sets a new temporary password and mails it, creating the account if needed. */
    public function invite(User $user): void
    {
        $this->assertEnabled();
        $password = bin2hex(random_bytes(12));
        // Rolled back if the mail cannot leave: nobody is left with an unknown password.
        $this->em->wrapInTransaction(function () use ($user, $password): void {
            $user->password = $this->hasher->hashPassword($user, $password);
            $user->mustChangePassword = true;
            $this->em->persist($user);
            $this->em->flush();
            $this->em->persist(new AuditLog($this->security->getUser()?->getUserIdentifier(), 'ACCESS_SENT', 'User', $user->getId()));
            $this->send($user, $password);
        });
    }

    public function assertEnabled(string $hint = 'Configurez la messagerie.'): void
    {
        if (str_starts_with($this->mailerDsn, 'null://')) {
            throw new UnprocessableEntityHttpException('L’envoi par e-mail est désactivé. '.$hint);
        }
    }

    public function send(User $user, string $temporaryPassword): void
    {
        $this->mailer->send((new Email())
            ->from($user->organization?->emailFrom ?: 'notifications@sofia.mahdora.fr')
            ->to($user->email)->subject('Votre accès à Sofia')
            ->text("Connectez-vous à {$this->baseUrl} avec votre adresse {$user->email} et ce mot de passe temporaire : {$temporaryPassword}\nChoisissez un nouveau mot de passe à votre première connexion."));
    }
}
