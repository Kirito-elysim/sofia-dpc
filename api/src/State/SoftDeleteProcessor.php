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
    public function __construct(private EntityManagerInterface $em)
    {
    }

    /** @param SoftDeletable $data */
    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): void
    {
        $this->em->wrapInTransaction(static function (EntityManagerInterface $em) use ($data): void {
            $em->refresh($data, LockMode::PESSIMISTIC_WRITE);
            $data->markDeleted();
        });
    }
}
