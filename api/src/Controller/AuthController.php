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
    public function __construct(private RoleHierarchyInterface $hierarchy, private \Symfony\Bundle\SecurityBundle\Security $security)
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
        $token = $this->security->getToken();
        $impersonator = $token instanceof \Symfony\Component\Security\Core\Authentication\Token\SwitchUserToken ? $token->getOriginalToken()->getUser() : null;
        return $this->json(['permissions' => \App\Security\Permissions::forUser($user), 'roleName' => $user->customRole?->name, 'profilePhoto' => $user->profilePhoto, 'mustChangePassword' => !$impersonator && $user->mustChangePassword, 'impersonator' => $impersonator instanceof User ? $impersonator->name : null, 'trainer' => $user->hasTrainerAccess(), 'email' => $user->email, 'name' => $user->name, 'roles' => $this->hierarchy->getReachableRoleNames($user->getRoles())]);
    }

    #[Route('/api/auth/change-password', methods: 'POST')]
    public function changePassword(\Symfony\Component\HttpFoundation\Request $request, EntityManagerInterface $em, \Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface $hasher): JsonResponse
    {
        $user = $this->getUser();
        $password = $request->toArray()['password'] ?? null;
        if (!$user instanceof User || !$user->mustChangePassword || $this->security->getToken() instanceof \Symfony\Component\Security\Core\Authentication\Token\SwitchUserToken) {
            throw $this->createAccessDeniedException();
        }
        if (!is_string($password) || mb_strlen($password) < 12 || strlen($password) > 4096 || $hasher->isPasswordValid($user, $password)) {
            return $this->json(['detail' => 'Choisissez un nouveau mot de passe différent, de 12 caractères minimum.'], 422);
        }
        $user->password = $hasher->hashPassword($user, $password);
        $user->mustChangePassword = false;
        $em->flush();
        return $this->me($user);
    }

    #[Route('/api/auth/logout', methods: 'POST')]
    public function logout(): never
    {
        throw new \LogicException('Handled by the firewall.');
    }
}
