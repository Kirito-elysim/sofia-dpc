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
        new Get(normalizationContext: ['groups' => ['user:read', 'user:item']]),
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

    /** @var \Doctrine\Common\Collections\Collection<int, Organization> */
    #[ORM\ManyToMany(targetEntity: Organization::class), ORM\JoinTable(name: 'user_organization'), Groups(['user:read','user:write'])]
    public \Doctrine\Common\Collections\Collection $organizations;

    public function addOrganization(Organization $organization): void
    {
        if (!$this->organizations->contains($organization)) {
            $this->organizations->add($organization);
        }
    }

    public function removeOrganization(Organization $organization): void
    {
        $this->organizations->removeElement($organization);
    }

    #[ORM\ManyToOne]
    public ?CustomRole $customRole = null;

    #[Groups('user:write')]
    public ?int $customRoleId = null;

    #[Groups('user:read')]
    public function getAssignedRole(): string
    {
        return $this->customRole ? 'custom:'.$this->customRole->id : $this->getRole();
    }

    #[ORM\Column(options: ['default' => false])]
    public bool $mustChangePassword = false;

    #[Groups('user:write')]
    public bool $sendAccess = false;

    #[ORM\Column(length: 40, nullable: true), Groups(['user:read','user:write']), Assert\Length(max: 40)]
    public ?string $phone = null;

    #[ORM\Column(length: 150, nullable: true), Groups(['user:read','user:write']), Assert\Length(max: 150)]
    public ?string $jobTitle = null;

    // ROLE_FORMATEUR sits outside the staff hierarchy: it only reaches /api/me/classes and is bound to one Trainer.
    // A staff account may be bound to a Trainer too, which adds "Mes classes" to its role.
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
        $this->organizations = new \Doctrine\Common\Collections\ArrayCollection();
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

    // Read on a single account only: the list would carry every picture.
    #[ORM\Column(type: 'text', nullable: true), Groups(['user:write', 'user:item'])]
    public ?string $profilePhoto = null;

    #[Assert\Callback]
    public function validateProfilePhoto(ExecutionContextInterface $context): void
    {
        if ($this->profilePhoto === null) {
            return;
        }
        if (strlen($this->profilePhoto) <= 2796230 && preg_match('~^data:(image/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$~D', $this->profilePhoto, $parts)) {
            $bytes = base64_decode($parts[2], true);
            $info = $bytes !== false && strlen($bytes) <= 2 * 1024 * 1024 ? @getimagesizefromstring($bytes) : false;
            if ($info && $info['mime'] === $parts[1]) {
                return;
            }
        }
        $context->buildViolation('Choisissez une image JPG ou PNG de 2 Mo maximum.')->atPath('profilePhoto')->addViolation();
    }

    #[Assert\Callback]
    public function validateTrainer(ExecutionContextInterface $ctx): void
    {
        if ('ROLE_FORMATEUR' === $this->getRole() && null === $this->trainer) {
            $ctx->buildViolation('Un compte formateur doit être lié à un formateur.')->atPath('trainer')->addViolation();
        }
    }

    public function hasTrainerAccess(): bool
    {
        return $this->trainer && $this->trainer->active && !$this->trainer->getDeletedAt();
    }

    /** A trainer-only account follows its sheet; a staff account does not. */
    public function canLogin(): bool
    {
        return $this->active && ('ROLE_FORMATEUR' !== $this->getRole() || $this->hasTrainerAccess());
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
