<?php

namespace App\EventListener;

use App\Entity\AuditLog;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\ORM\Event\PrePersistEventArgs;
use Doctrine\ORM\Events;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\Security\Core\Authentication\Token\SwitchUserToken;

/** While impersonating, the journal names the real author and keeps the borrowed account aside. */
#[AsDoctrineListener(event: Events::prePersist)]
final class ImpersonationAudit
{
    public function __construct(private Security $security)
    {
    }

    public function prePersist(PrePersistEventArgs $args): void
    {
        $log = $args->getObject();
        $token = $this->security->getToken();
        if ($log instanceof AuditLog && $token instanceof SwitchUserToken && $log->userEmail === $token->getUserIdentifier()) {
            $log->userEmail = $token->getOriginalToken()->getUserIdentifier();
            $log->data['onBehalfOf'] = $token->getUserIdentifier();
        }
    }
}
