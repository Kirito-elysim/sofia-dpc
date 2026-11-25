<?php

namespace App\State;

use ApiPlatform\Doctrine\Orm\Extension\QueryCollectionExtensionInterface;
use ApiPlatform\Doctrine\Orm\Extension\QueryItemExtensionInterface;
use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use ApiPlatform\Metadata\Operation;
use App\Entity\SoftDeletable;
use Doctrine\ORM\QueryBuilder;

final class ExcludeDeletedExtension implements QueryCollectionExtensionInterface, QueryItemExtensionInterface
{
    public function applyToCollection(QueryBuilder $queryBuilder, QueryNameGeneratorInterface $queryNameGenerator, string $resourceClass, ?Operation $operation = null, array $context = []): void
    {
        $this->excludeDeleted($queryBuilder, $resourceClass);
    }

    public function applyToItem(QueryBuilder $queryBuilder, QueryNameGeneratorInterface $queryNameGenerator, string $resourceClass, array $identifiers, ?Operation $operation = null, array $context = []): void
    {
        $this->excludeDeleted($queryBuilder, $resourceClass);
    }

    private function excludeDeleted(QueryBuilder $queryBuilder, string $resourceClass): void
    {
        if (is_subclass_of($resourceClass, SoftDeletable::class)) {
            $queryBuilder->andWhere($queryBuilder->getRootAliases()[0].'.deletedAt IS NULL');
        }
    }
}
