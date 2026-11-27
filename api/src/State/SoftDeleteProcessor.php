<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\SoftDeletable;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;

/** @implements ProcessorInterface<SoftDeletable, void> */
final class SoftDeleteProcessor implements ProcessorInterface
{
    public function __construct(private EntityManagerInterface $em, private \App\Security\OrganizationScope $scope)
    {
    }

    /** @param SoftDeletable $data */
    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): void
    {
        if ($data instanceof \App\Entity\Trainer) {
            $this->scope->requireTrainer($data);
        }
        $this->em->wrapInTransaction(static function (EntityManagerInterface $em) use ($data): void {
            $em->refresh($data, LockMode::PESSIMISTIC_WRITE);
            if ($data instanceof \App\Entity\TimeSlot
                && $em->getConnection()->fetchOne('SELECT 1 FROM class_slot WHERE time_slot_id = ? LIMIT 1', [$data->getId()])) {
                throw new \Symfony\Component\HttpKernel\Exception\ConflictHttpException('Ce créneau est utilisé dans des classes : désactivez-le.');
            }
            if ($data instanceof \App\Entity\Formation
                && $em->getConnection()->fetchOne('SELECT 1 FROM virtual_class WHERE formation_id = ? LIMIT 1', [$data->getId()])) {
                throw new \Symfony\Component\HttpKernel\Exception\ConflictHttpException('Suppression impossible : cette formation possède déjà une session, avec ou sans inscription.');
            }
            if ($data instanceof \App\Entity\TargetAudience
                && $em->getConnection()->fetchOne('SELECT 1 FROM formation WHERE target_audience_id = ? LIMIT 1', [$data->id])) {
                throw new \Symfony\Component\HttpKernel\Exception\ConflictHttpException('Ce public cible est lié à une formation.');
            }
            $data->markDeleted();
        });
    }
}
