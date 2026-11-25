<?php

namespace App\Security;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

final class OrganizationScope
{
    public function __construct(private Security $security, private EntityManagerInterface $em) {}

    public function ids(): ?array
    {
        $user = $this->security->getUser();
        if (!$user instanceof User || $user->getRole() === 'ROLE_SUPER_ADMIN') {
            return null;
        }
        $ids = $user->organizations->map(static fn ($organization) => $organization->getId())->toArray();
        return array_values($ids ?: array_filter([$user->organization?->getId()]));
    }

    public function sql(string $column): string
    {
        $ids = $this->ids();
        return $ids === null ? 'TRUE' : ($ids ? $column.' IN ('.implode(',', $ids).')' : 'FALSE');
    }

    public function require(?int $id): void
    {
        $ids = $this->ids();
        if ($ids !== null && !in_array($id, $ids, true)) {
            throw new AccessDeniedHttpException('Cet organisme est hors de votre périmètre.');
        }
    }

    #[AsEventListener(event: 'kernel.request', priority: 6)]
    public function apply(RequestEvent $event): void
    {
        if (!$event->isMainRequest() || !str_starts_with($event->getRequest()->getPathInfo(), '/api/')) {
            return;
        }
        $user = $this->security->getUser();
        $filters = $this->em->getFilters();
        if ($filters->isEnabled('organization_scope')) {
            $filters->disable('organization_scope');
        }
        // Loads the linked trainer before the filter can hide it (it may belong to another organization).
        if ($user instanceof User) {
            $user->hasTrainerAccess();
        }
        if ($user instanceof User && !$user->canLogin() && $event->getRequest()->getPathInfo() !== '/api/auth/logout' && $event->getRequest()->getPathInfo() !== '/api/auth/impersonate/exit') {
            throw new AccessDeniedHttpException('Ce compte est désactivé.');
        }
        if ($user instanceof User && $user->getRole() !== 'ROLE_FORMATEUR' && null !== ($ids = $this->ids())) {
            $filters->enable('organization_scope')->setParameterList('organizations', $ids ?: [0]);
        }
    }
}
