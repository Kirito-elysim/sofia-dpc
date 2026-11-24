<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\State\UserProcessor;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

// No DELETE: users are deactivated so the audit trail keeps pointing at a real account.
#[ORM\Entity]
#[ORM\Table(name: '"user"')]
#[UniqueEntity('email')]
#[UniqueEntity('trainer', message: 'Ce formateur a déjà un compte.')]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(),
        new Post(validationContext: ['groups' => ['Default', 'create']], processor: UserProcessor::class),
        new Patch(processor: UserProcessor::class),
    ],
    security: "is_granted('ROLE_SUPER_ADMIN')",
    normalizationContext: ['groups' => ['user:read']],
    denormalizationContext: ['groups' => ['user:write']],
)]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    public const ROLES = ['ROLE_SUPER_ADMIN', 'ROLE_ADMIN', 'ROLE_SUIVI', 'ROLE_LECTURE', 'ROLE_FORMATEUR'];

    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    // Write-only, hashed by UserProcessor, never persisted.
    #[Groups('user:write'), Assert\NotBlank(groups: ['create']), Assert\Length(min: 12, max: 4096, minMessage: '12 caractères minimum.')]
    public ?string $plainPassword = null;

    // ROLE_FORMATEUR sits outside the staff hierarchy: it only reaches /api/me/classes and is bound to one Trainer.
    #[ORM\OneToOne, Groups(['user:read', 'user:write'])]
    public ?Trainer $trainer = null;

    #[ORM\ManyToOne, Groups(['user:read', 'user:write'])]
    public ?Organization $organization = null;

    #[ORM\Column(nullable: true), Groups('user:read')]
    public ?\DateTimeImmutable $lastLoginAt = null;

    /** @param list<string> $roles one of self::ROLES */
    public function __construct(
        #[ORM\Column(length: 180, unique: true), Groups(['user:read', 'user:write']), Assert\NotBlank, Assert\Email] public string $email,
        #[ORM\Column(length: 150), Groups(['user:read', 'user:write']), Assert\NotBlank] public string $name,
        #[ORM\Column] public string $password = '',
        #[ORM\Column(type: 'json')] public array $roles = ['ROLE_LECTURE'],
        #[ORM\Column, Groups(['user:read', 'user:write'])] public bool $active = true,
    ) {
    }

    #[Groups('user:read')]
    public function getId(): ?int
    {
        return $this->id;
    }

    #[Groups('user:read')]
    #[Assert\Choice(choices: self::ROLES)]
    public function getRole(): string
    {
        return $this->roles[0] ?? 'ROLE_LECTURE';
    }

    #[Groups('user:write')]
    public function setRole(string $role): void
    {
        $this->roles = [$role];
    }

    #[Assert\Callback]
    public function validateTrainer(ExecutionContextInterface $ctx): void
    {
        if (('ROLE_FORMATEUR' === $this->getRole()) !== (null !== $this->trainer)) {
            $ctx->buildViolation('Un compte formateur doit être lié à un formateur, et seulement lui.')->atPath('trainer')->addViolation();
        }
    }

    public function getUserIdentifier(): string
    {
        return $this->email;
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function getRoles(): array
    {
        return array_unique([...$this->roles, 'ROLE_USER']);
    }

    public function eraseCredentials(): void
    {
    }
}
