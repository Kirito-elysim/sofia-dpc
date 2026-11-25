<?php

namespace App\EventListener;

use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Http\Event\LogoutEvent;

#[AsEventListener(priority: 128)]
final class ApiLogoutResponse
{
    public function __invoke(LogoutEvent $event): void
    {
        if ('/api/auth/logout' === $event->getRequest()->getPathInfo()) {
            $event->setResponse(new Response(status: Response::HTTP_NO_CONTENT));
        }
    }
}
