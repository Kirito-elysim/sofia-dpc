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
        private \Doctrine\ORM\EntityManagerInterface $em,
        private \App\Service\AccessMailer $mailer,
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

        if ($data->customRoleId !== null) {
            $data->customRole = $data->customRoleId === 0 ? null
                : ($this->em->find(\App\Entity\CustomRole::class, $data->customRoleId)
                    ?? throw new UnprocessableEntityHttpException('Rôle personnalisé introuvable.'));
        }
        if ($data->customRole && $data->getRole() !== 'ROLE_LECTURE') {
            throw new UnprocessableEntityHttpException('Sélectionnez un seul rôle.');
        }

        $creating = $operation instanceof \ApiPlatform\Metadata\Post;
        $temporary = $data->plainPassword;
        if ($creating) {
            $data->mustChangePassword = true;
            if ($data->organization && $data->organizations->isEmpty()) {
                $data->organizations->add($data->organization);
            }
        }

        $request = $context['request'] ?? null;
        $input = $request instanceof \Symfony\Component\HttpFoundation\Request ? $request->toArray() : [];
        if (array_key_exists('organization', $input) && !array_key_exists('organizations', $input) && !$creating) {
            $data->organizations->clear();
            if ($data->organization) {
                $data->addOrganization($data->organization);
            }
        }
        if ($data->getRole() === 'ROLE_SUPER_ADMIN') {
            $data->organizations->clear();
        }
        $data->organization = $data->organizations->first() ?: null;

        if ($data->customRole && $data->organizations->isEmpty()) {
            throw new UnprocessableEntityHttpException('Rattachez cet utilisateur à au moins un organisme.');
        }
        // A staff account may also teach for an organization it does not manage.
        if ('ROLE_FORMATEUR' === $data->getRole() && $data->trainer && $data->trainer->organization && !$data->organizations->contains($data->trainer->organization)) {
            throw new UnprocessableEntityHttpException('Le formateur doit appartenir à un organisme rattaché au compte.');
        }

        if (null !== $data->plainPassword && '' !== $data->plainPassword) {
            $data->password = $this->hasher->hashPassword($data, $data->plainPassword);
            $data->plainPassword = null;
        }

        if (!$creating || !$data->sendAccess) {
            return $this->persist->process($data, $operation, $uriVariables, $context);
        }
        $this->mailer->assertEnabled('Choisissez la remise manuelle ou configurez la messagerie.');
        return $this->em->wrapInTransaction(function () use ($data, $operation, $uriVariables, $context, $temporary) {
            $user = $this->persist->process($data, $operation, $uriVariables, $context);
            $this->mailer->send($user, (string) $temporary);
            return $user;
        });
    }
}
