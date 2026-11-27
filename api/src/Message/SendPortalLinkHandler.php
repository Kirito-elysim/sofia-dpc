<?php

namespace App\Message;

use App\Entity\Participant;
use App\Entity\PortalLink;
use App\Service\PortalAccess;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

#[AsMessageHandler]
final class SendPortalLinkHandler
{
    private const MINUTES = 30;

    public function __construct(private EntityManagerInterface $em, private MailerInterface $mailer, private PortalAccess $access,
        #[Autowire('%env(SOFIA_FRONT_URL)%')] private string $baseUrl)
    {
    }

    public function __invoke(SendPortalLink $message): void
    {
        $participant = $this->em->find(Participant::class, $message->participantId);
        // Re-read at send time: the registration may be gone.
        $organization = $participant && !$participant->getDeletedAt() ? $this->access->sender((int) $participant->getId()) : null;
        if (!$organization) {
            return;
        }
        $token = bin2hex(random_bytes(32));
        $this->em->persist(new PortalLink($participant, hash('sha256', $token), new \DateTimeImmutable('+'.self::MINUTES.' minutes')));
        $this->em->flush();
        // In the fragment: the token never reaches a server log.
        $link = rtrim($this->baseUrl, '/').'/espace#token='.$token;
        $this->mailer->send((new Email())
            ->from(new Address($organization['email_from'], $organization['name']))
            ->to(new Address($participant->email, $participant->firstName.' '.mb_strtoupper($participant->lastName)))
            ->subject($organization['name'].' — Votre lien de connexion')
            ->text(sprintf("Bonjour %s,\n\nAccédez à vos formations avec ce lien, valable %d minutes et utilisable une seule fois :\n%s\n\nSi vous n'avez rien demandé, ignorez ce message.\n\n%s", $participant->firstName, self::MINUTES, $link, $organization['name'])));
    }
}
