<?php

namespace App\Controller;

use App\Entity\Trainer;
use App\Entity\User;
use App\Security\OrganizationScope;
use App\Service\AccessMailer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/** Sofia access of a trainer, managed from the trainer sheet. */
#[IsGranted('SOFIA_EDIT_TRAINERS')]
class TrainerAccessController extends AbstractController
{
    public function __construct(
        private EntityManagerInterface $em,
        private OrganizationScope $scope,
        private AccessMailer $mailer,
    ) {
    }

    #[Route('/api/trainer-accounts', methods: 'GET')]
    public function list(): JsonResponse
    {
        /** @var list<User> $users */
        $users = $this->em->createQuery('SELECT u, t FROM '.User::class.' u JOIN u.trainer t')->getResult();

        return $this->json(array_map(static fn (User $u) => [
            'userId' => $u->getId(),
            'superAdmin' => 'ROLE_SUPER_ADMIN' === $u->getRole(),
            'trainerId' => $u->trainer?->getId(),
            'staff' => 'ROLE_FORMATEUR' !== $u->getRole(),
            'active' => $u->active,
        ], $users));
    }

    /** Creates the account, links an existing one with the same e-mail, or sends a new temporary password. */
    #[Route('/api/trainers/{id<\d+>}/access', methods: 'POST')]
    public function grant(int $id): JsonResponse
    {
        $trainer = $this->trainer($id);
        if (!$trainer->active) {
            throw new UnprocessableEntityHttpException('Activez le formateur avant de lui donner un accès.');
        }
        $users = $this->em->getRepository(User::class);
        $user = $users->findOneBy(['trainer' => $trainer]);
        if ($user) {
            if ('ROLE_FORMATEUR' !== $user->getRole()) {
                throw new ConflictHttpException('Ce formateur utilise déjà son compte de gestion.');
            }
            if (!$user->active) {
                throw new ConflictHttpException('Réactivez l’accès avant de le renvoyer.');
            }

            return $this->invite($user, 'sent');
        }

        /** @var User|null $existing */
        $existing = $this->em->createQuery('SELECT u FROM '.User::class.' u WHERE LOWER(u.email) = :email')
            ->setParameter('email', mb_strtolower($trainer->email))->setMaxResults(1)->getOneOrNullResult();
        if ($existing) {
            // The previous sheet may sit outside the caller's organizations, or be deleted.
            $this->em->getFilters()->isEnabled('organization_scope') && $this->em->getFilters()->disable('organization_scope');
            if ($existing->trainer && null === $existing->trainer->getDeletedAt()) {
                throw new ConflictHttpException('Le compte utilisant cet e-mail est déjà rattaché à un autre formateur.');
            }
            $existing->trainer = $trainer;
            $this->em->flush();

            return $this->json(['result' => 'linked']);
        }

        $user = new User($trainer->email, mb_substr($trainer->firstName.' '.$trainer->lastName, 0, 150), '', ['ROLE_FORMATEUR']);
        $user->trainer = $trainer;
        foreach ($trainer->getOrganizations() as $organization) {
            $user->addOrganization($organization);
        }
        $user->organization = $user->organizations->first() ?: null;

        return $this->invite($user, 'created');
    }

    #[Route('/api/trainers/{id<\d+>}/access', methods: 'PATCH')]
    public function toggle(int $id, Request $request): JsonResponse
    {
        $user = $this->em->getRepository(User::class)->findOneBy(['trainer' => $this->trainer($id)]);
        $active = $request->toArray()['active'] ?? null;
        if (!$user || 'ROLE_FORMATEUR' !== $user->getRole() || !is_bool($active)) {
            throw new UnprocessableEntityHttpException('Seul un compte formateur se gère depuis cette fiche.');
        }
        $user->active = $active;
        $this->em->flush();

        return $this->json(['result' => $active ? 'enabled' : 'disabled']);
    }

    private function trainer(int $id): Trainer
    {
        $trainer = $this->em->getRepository(Trainer::class)->findOneBy(['id' => $id]);
        if (!$trainer || $trainer->getDeletedAt()) {
            throw $this->createNotFoundException('Formateur introuvable.');
        }
        $this->scope->requireTrainer($trainer);

        return $trainer;
    }

    private function invite(User $user, string $result): JsonResponse
    {
        $this->mailer->invite($user);

        return $this->json(['result' => $result]);
    }
}
