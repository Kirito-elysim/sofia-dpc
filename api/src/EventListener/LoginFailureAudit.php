<?php

namespace App\EventListener;

use App\Entity\AuditLog;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Event\LoginFailureEvent;

#[AsEventListener]
final class LoginFailureAudit
{
    public function __construct(private EntityManagerInterface $em) {}

    public function __invoke(LoginFailureEvent $event): void
    {
        if ('/api/auth/login' !== $event->getRequest()->getPathInfo()) { return; }
        $badge = $event->getPassport()?->getBadge(UserBadge::class);
        $email = $badge instanceof UserBadge ? mb_substr($badge->getUserIdentifier(), 0, 180) : null;
        $this->em->persist(new AuditLog($email, 'LOGIN_FAILURE', 'User', null, [], $event->getRequest()->getClientIp()));
        $this->em->flush();
    }
}
