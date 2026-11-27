<?php

namespace App\Controller;

use App\Entity\CustomRole;
use App\Security\Permissions;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Doctrine\DBAL\LockMode;
use Symfony\Component\HttpFoundation\{JsonResponse, Request, Response};
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[IsGranted('ROLE_SUPER_ADMIN')]
final class RoleController extends AbstractController
{
    #[Route('/api/custom-roles', methods: ['GET'])]
    public function list(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $roles = $em->createQuery('SELECT r FROM '.CustomRole::class.' r WHERE r.deletedAt IS '
            .($request->query->getBoolean('deleted') ? 'NOT NULL' : 'NULL').' ORDER BY r.name')->getResult();

        return $this->json([
            'dependencies' => Permissions::DEPENDENCIES,
            'roles' => $roles,
            // Accounts per role (deactivated ones included), keyed like the assigned role of a user.
            'usage' => (object) $em->getConnection()->fetchAllKeyValue('SELECT COALESCE(\'custom:\' || custom_role_id, roles->>0), count(*)
                FROM "user" WHERE deleted_at IS NULL GROUP BY 1'),
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
        if (!$role || $role->getDeletedAt()) {
            throw $this->createNotFoundException();
        }
        $role->name = $name;
        $role->permissions = array_values(array_unique($permissions));
        $em->persist($role);
        try {
            $em->flush();
        } catch (\Doctrine\DBAL\Exception\UniqueConstraintViolationException) {
            return $this->json(['detail' => 'Ce nom de rôle est déjà utilisé, y compris par un rôle supprimé.'], 409);
        }
        return $this->json($role);
    }

    #[Route('/api/custom-roles/{id<\d+>}', methods: ['DELETE'])]
    public function delete(int $id, EntityManagerInterface $em): Response
    {
        return $em->wrapInTransaction(function () use ($id, $em): Response {
            // Locking the role makes a concurrent assignment wait for this decision.
            $role = $em->find(CustomRole::class, $id, LockMode::PESSIMISTIC_WRITE);
            if (!$role || $role->getDeletedAt()) {
                throw $this->createNotFoundException('Rôle introuvable.');
            }
            $users = (int) $em->getConnection()->fetchOne('SELECT count(*) FROM "user" WHERE custom_role_id = ? AND deleted_at IS NULL', [$id]);
            if ($users > 0) {
                return $this->json(['detail' => "Ce rôle est attribué à $users personne(s) : donnez-leur un autre rôle avant de le supprimer."], 409);
            }
            $role->markDeleted();

            return new Response(status: Response::HTTP_NO_CONTENT);
        });
    }
}
