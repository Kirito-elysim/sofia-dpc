<?php

namespace App\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\User;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/** @implements ProcessorInterface<User, User> */
final class UserProcessor implements ProcessorInterface
{
    public function __construct(
        /** @var ProcessorInterface<User, User> */
        #[Autowire(service: 'api_platform.doctrine.orm.state.persist_processor')] private ProcessorInterface $persist,
        private UserPasswordHasherInterface $hasher,
        private Security $security,
    ) {
    }

    /** @param User $data */
    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): User
    {
        $previous = $context['previous_data'] ?? null;

        // Nobody can lock themselves out or demote themselves (a SUPER_ADMIN could be the last one).
        if ($previous instanceof User && $this->security->getUser()?->getUserIdentifier() === $previous->email
            && (!$data->active || $data->getRole() !== $previous->getRole())) {
            throw new UnprocessableEntityHttpException('Vous ne pouvez pas modifier votre propre rôle ni vous désactiver.');
        }

        if (null !== $data->plainPassword && '' !== $data->plainPassword) {
            $data->password = $this->hasher->hashPassword($data, $data->plainPassword);
            $data->plainPassword = null;
        }

        return $this->persist->process($data, $operation, $uriVariables, $context);
    }
}
