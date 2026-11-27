<?php

namespace App\State;

use ApiPlatform\Doctrine\Orm\Extension\QueryCollectionExtensionInterface;
use ApiPlatform\Doctrine\Orm\Extension\QueryItemExtensionInterface;
use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use ApiPlatform\Metadata\Operation;
use App\Entity\SoftDeletable;
use Doctrine\ORM\QueryBuilder;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/** Deleted records leave every list and sheet; an admin may list them (within their organizations) with `?deleted=1`. */
final class ExcludeDeletedExtension implements QueryCollectionExtensionInterface, QueryItemExtensionInterface
{
    public function __construct(private Security $security)
    {
    }

    public function applyToCollection(QueryBuilder $queryBuilder, QueryNameGeneratorInterface $queryNameGenerator, string $resourceClass, ?Operation $operation = null, array $context = []): void
    {
        $deleted = '1' === (string) ($context['filters']['deleted'] ?? '');
        if ($deleted && !$this->security->isGranted('ROLE_ADMIN')) {
            throw new AccessDeniedHttpException('Les éléments supprimés sont réservés aux administrateurs.');
        }
        $this->filter($queryBuilder, $resourceClass, $deleted);
    }

    public function applyToItem(QueryBuilder $queryBuilder, QueryNameGeneratorInterface $queryNameGenerator, string $resourceClass, array $identifiers, ?Operation $operation = null, array $context = []): void
    {
        $this->filter($queryBuilder, $resourceClass, false);
    }

    private function filter(QueryBuilder $queryBuilder, string $resourceClass, bool $deleted): void
    {
        if (is_subclass_of($resourceClass, SoftDeletable::class)) {
            $queryBuilder->andWhere($queryBuilder->getRootAliases()[0].'.deletedAt IS '.($deleted ? 'NOT NULL' : 'NULL'));
        }
    }
}
