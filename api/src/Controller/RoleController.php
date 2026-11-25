<?php

namespace App\Controller;

use App\Entity\CustomRole;
use App\Security\Permissions;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{JsonResponse, Request};
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[IsGranted('ROLE_SUPER_ADMIN')]
final class RoleController extends AbstractController
{
    #[Route('/api/custom-roles', methods: ['GET'])]
    public function list(EntityManagerInterface $em): JsonResponse
    {
        return $this->json([
            'dependencies' => Permissions::DEPENDENCIES,
            'roles' => $em->getRepository(CustomRole::class)->findBy([], ['name' => 'ASC']),
            'permissions' => Permissions::READ + Permissions::WRITE,
        ]);
    }

    #[Route('/api/custom-roles', methods: ['POST'])]
    public function save(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $input = $request->toArray();
        $name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
        $permissions = $input['permissions'] ?? null;
        $id = $input['id'] ?? null;
        if ($name === '' || mb_strlen($name) > 100 || !is_array($permissions) || !array_is_list($permissions)
            || array_filter($permissions, static fn ($value) => !is_string($value) || !isset((Permissions::READ + Permissions::WRITE)[$value]))
            || ($id !== null && (!is_int($id) || $id < 1))) {
            return $this->json(['detail' => 'Vérifiez le nom et les permissions du rôle.'], 422);
        }
        $role = $id === null ? new CustomRole($name, []) : $em->find(CustomRole::class, $id);
        if (!$role) {
            throw $this->createNotFoundException();
        }
        $role->name = $name;
        $role->permissions = array_values(array_unique($permissions));
        $em->persist($role);
        try {
            $em->flush();
        } catch (\Doctrine\DBAL\Exception\UniqueConstraintViolationException) {
            return $this->json(['detail' => 'Ce nom de rôle est déjà utilisé.'], 409);
        }
        return $this->json($role);
    }
}
