<?php

namespace App\Controller;

use App\Entity\User;
use App\Entity\AuditLog;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Core\Role\RoleHierarchyInterface;
use Symfony\Component\Security\Core\User\UserInterface;

class AuthController extends AbstractController
{
    public function __construct(private RoleHierarchyInterface $hierarchy)
    {
    }

    #[Route('/api/auth/login', methods: 'POST')]
    public function login(?UserInterface $user, EntityManagerInterface $em): JsonResponse
    {
        if ($user instanceof User) {
            $user->lastLoginAt = new \DateTimeImmutable();
            $em->persist(new AuditLog($user->email, 'LOGIN_SUCCESS', 'User', $user->getId()));
            $em->flush();
        }

        return $this->me($user);
    }

    #[Route('/api/auth/me', methods: 'GET')]
    public function me(?UserInterface $user): JsonResponse
    {
        /** @var \App\Entity\User $user */
        return $this->json(['email' => $user->email, 'name' => $user->name, 'roles' => $this->hierarchy->getReachableRoleNames($user->getRoles())]);
    }

    #[Route('/api/auth/logout', methods: 'POST')]
    public function logout(): never
    {
        throw new \LogicException('Handled by the firewall.');
    }
}
