<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Session;
use App\Entity\SessionFormation;
use App\Security\OrganizationScope;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/** @implements ProcessorInterface<Session|SessionFormation, mixed> */
final class SessionProcessor implements ProcessorInterface
{
    /** @param ProcessorInterface<Session|SessionFormation, mixed> $persist */
    public function __construct(
        private OrganizationScope $scope,
        private EntityManagerInterface $em,
        #[Autowire(service: 'api_platform.doctrine.orm.state.persist_processor')] private ProcessorInterface $persist,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        $session = $data instanceof SessionFormation ? $data->session : $data;
        $this->scope->require($session->organization->getId());
        $previous = $context['previous_data'] ?? null;
        if ($data instanceof Session && $previous instanceof Session && $previous->organization->getId() !== $data->organization->getId() && $data->getSessionFormations()) {
            throw new ConflictHttpException('Retirez les formations avant de changer l’organisme de la session.');
        }
        if ($data instanceof SessionFormation) {
            if ($previous instanceof SessionFormation && ($previous->session !== $data->session || $previous->formation !== $data->formation)) {
                throw new ConflictHttpException('La session et la formation d’un rattachement ne se changent pas.');
            }
            $existing = $this->em->getRepository(SessionFormation::class)->findOneBy(['session' => $data->session, 'formation' => $data->formation, 'deletedAt' => null]);
            if ($existing && $existing !== $data) {
                throw new ConflictHttpException('Cette formation est déjà rattachée à la session.');
            }
        }

        if ($data instanceof SessionFormation && $data->capacity < $data->getRegisteredCount()) {
            throw new ConflictHttpException($data->getRegisteredCount().' PS sont déjà inscrits : la capacité ne peut pas être inférieure.');
        }
        // A planned class keeps falling inside the access dates of everything it serves.
        foreach ($data instanceof Session ? $data->getSessionFormations() : [$data] as $sessionFormation) {
            foreach ($sessionFormation->plannedClasses() as $class) {
                if ($class->date < $sessionFormation->getEffectiveAccessStartsOn() || $class->date > $sessionFormation->getEffectiveAccessEndsOn()) {
                    throw new ConflictHttpException('Une classe virtuelle est planifiée le '.$class->date->format('d/m/Y').', hors de ces dates.');
                }
            }
        }

        return $this->persist->process($data, $operation, $uriVariables, $context);
    }
}
