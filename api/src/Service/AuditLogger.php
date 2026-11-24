<?php

namespace App\Service;

use App\Entity\AuditLog;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\RequestStack;

class AuditLogger
{
    public function __construct(
        private EntityManagerInterface $em,
        private Security $security,
        private RequestStack $requests,
    ) {
    }

    /** @param array<string, mixed> $data Persists only; the caller flushes. */
    public function log(string $action, ?string $entity = null, ?int $entityId = null, array $data = []): void
    {
        $this->em->persist(new AuditLog(
            $this->security->getUser()?->getUserIdentifier(),
            $action,
            $entity,
            $entityId,
            $data,
            $this->requests->getCurrentRequest()?->getClientIp(),
        ));
    }
}
