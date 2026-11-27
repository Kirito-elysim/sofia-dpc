<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Security\OrganizationScope;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

final class ScopedCatalogProcessor implements ProcessorInterface
{
    public function __construct(
        private OrganizationScope $scope,
        #[Autowire(service: 'api_platform.doctrine.orm.state.persist_processor')] private ProcessorInterface $persist,
        private \Doctrine\ORM\EntityManagerInterface $em,
    ) {}

    /** A trainer-only account keeps the identity of its sheet; staff accounts are left untouched. */
    private function syncAccount(\App\Entity\Trainer $trainer): void
    {
        $users = $this->em->getRepository(\App\Entity\User::class);
        $user = $trainer->getId() ? $users->findOneBy(['trainer' => $trainer]) : null;
        if (!$user || 'ROLE_FORMATEUR' !== $user->getRole()) {
            return;
        }
        $other = $users->findOneBy(['email' => $trainer->email]);
        if ($other && $other !== $user) {
            throw new \Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException('Cet e-mail est déjà utilisé par un autre compte.');
        }
        $user->email = $trainer->email;
        $user->name = mb_substr($trainer->firstName.' '.$trainer->lastName, 0, 150);
        $user->organizations->clear();
        foreach ($trainer->getOrganizations() as $organization) {
            $user->addOrganization($organization);
        }
        $user->organization = $user->organizations->first() ?: null;
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        if ($data instanceof \App\Entity\Trainer) {
            if ($data->getId()) {
                $this->scope->requireTrainer($data);
            }
            foreach ($data->getOrganizations()->isEmpty() ? [null] : $data->getOrganizations() as $organization) {
                $this->scope->require($organization?->getId());
            }
            $data->updatedAt = new \DateTimeImmutable();
            $this->syncAccount($data);
        } else {
            $this->scope->require($data->organization?->getId());
        }
        if ($data instanceof \App\Entity\Formation) {
            foreach ($data->getAdditionalOrganizations() as $organization) {
                $this->scope->require($organization->getId());
            }
            return $this->em->wrapInTransaction(function () use ($data, $operation, $uriVariables, $context) {
                if ($data->targetAudience) {
                    $this->em->refresh($data->targetAudience, \Doctrine\DBAL\LockMode::PESSIMISTIC_READ);
                    if ($data->targetAudience->getDeletedAt()) {
                        throw new \Symfony\Component\HttpKernel\Exception\ConflictHttpException('Ce public cible a été supprimé.');
                    }
                }
                return $this->persist->process($data, $operation, $uriVariables, $context);
            });
        }
        return $this->persist->process($data, $operation, $uriVariables, $context);
    }
}
