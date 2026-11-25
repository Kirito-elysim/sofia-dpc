<?php

namespace App\Security;

use App\Entity\User;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpFoundation\JsonResponse;

#[AsEventListener(event: 'kernel.request', priority: 7)]
final class TemporaryPasswordGuard
{
    public function __construct(private Security $security) {}

    public function __invoke(RequestEvent $event): void
    {
        $path = $event->getRequest()->getPathInfo();
        if (!str_starts_with($path, '/api/') || in_array($path, ['/api/auth/login','/api/auth/logout','/api/auth/me','/api/auth/change-password'], true)) {
            return;
        }
        // The temporary password belongs to its owner: an impersonating admin is not asked to replace it.
        if ($this->security->getToken() instanceof \Symfony\Component\Security\Core\Authentication\Token\SwitchUserToken) {
            return;
        }
        $user = $this->security->getUser();
        if ($user instanceof User && $user->mustChangePassword) {
            $event->setResponse(new JsonResponse(['detail' => 'Changez votre mot de passe temporaire pour accéder à Sofia.'], 403));
        }
    }
}
