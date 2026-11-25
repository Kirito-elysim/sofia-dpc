<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use App\State\SoftDeleteProcessor;
use App\Validator\ProfilePhoto;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

/** "Formateur". No Zoom account of their own. */
#[ORM\Entity]
#[UniqueEntity('email')]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(normalizationContext: ['groups' => ['read', 'trainer:item']]),
        new Post(processor: \App\State\ScopedCatalogProcessor::class, security: "is_granted('SOFIA_EDIT_TRAINERS')"),
        new Patch(processor: \App\State\ScopedCatalogProcessor::class, security: "is_granted('SOFIA_EDIT_TRAINERS')"),
        new Delete(security: "is_granted('SOFIA_EDIT_TRAINERS')", processor: SoftDeleteProcessor::class),
    ],
    security: "is_granted('SOFIA_TRAINERS')",
    normalizationContext: ['groups' => ['read']],
    denormalizationContext: ['groups' => ['write']],
)]
class Trainer extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    /** @var Collection<int, Organization> */
    #[ORM\ManyToMany(targetEntity: Organization::class)]
    #[ORM\JoinTable(name: 'trainer_organization')]
    #[Groups(['read', 'write'])]
    private Collection $organizations;

    #[ORM\Column(length: 80, nullable: true), Groups(['read', 'write']), Assert\Length(max: 80)]
    public ?string $profession = null;

    #[ORM\Column(length: 20, nullable: true), Groups(['read', 'write']), Assert\Regex('/\A[0-9 ]{9,20}\z/', message: 'Le numéro RPPS ou ADELI comporte au moins 9 chiffres.')]
    public ?string $rppsNumber = null;

    /** @var list<string> */
    #[ORM\Column(type: 'json', options: ['default' => '[]']), Groups(['read', 'write'])]
    #[Assert\All([new Assert\Choice(choices: ['VIRTUAL_CLASS', 'ELEARNING', 'INTEGRATED'])])]
    public array $formats = [];

    #[ORM\Column(type: 'text', nullable: true), Groups(['read', 'write']), Assert\Length(max: 2000)]
    public ?string $biography = null;

    // Read on a single sheet only: the list would carry every picture.
    #[ORM\Column(type: 'text', nullable: true), Groups(['write', 'trainer:item'])]
    public ?string $photo = null;

    #[ORM\Column(nullable: true), Groups('read')]
    public ?\DateTimeImmutable $updatedAt = null;

    public function __construct(
        #[ORM\Column(length: 100), Groups(['read', 'write', 'user:read']), Assert\NotBlank] public string $firstName,
        #[ORM\Column(length: 100), Groups(['read', 'write', 'user:read']), Assert\NotBlank] public string $lastName,
        #[ORM\Column(length: 180, unique: true), Groups(['read', 'write']), Assert\NotBlank, Assert\Email] public string $email,
        #[ORM\Column(length: 20, nullable: true), Groups(['read', 'write']), Assert\Regex('/^\+?[0-9 .]*$/')] public ?string $phone = null,
        #[ORM\Column(options: ['default' => true]), Groups(['read', 'write'])] public bool $active = true,
        #[ORM\Column(length: 12, nullable: true), Groups(['read', 'write']), Assert\Length(max: 12)] public ?string $civility = null,
        #[ORM\Column(length: 100, nullable: true), Groups(['read', 'write']), Assert\Length(max: 100)] public ?string $specialty = null,
        #[ORM\Column(length: 500, nullable: true), Groups(['read', 'write']), Assert\Length(max: 500)] public ?string $comments = null,
    ) {
        $this->organizations = new ArrayCollection();
    }

    #[Groups(['read', 'user:read'])]
    public function getId(): ?int
    {
        return $this->id;
    }

    /** @return Collection<int, Organization> */
    public function getOrganizations(): Collection
    {
        return $this->organizations;
    }

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

    #[Assert\Callback]
    public function validatePhoto(ExecutionContextInterface $context): void
    {
        if (null !== $this->photo && !ProfilePhoto::isValid($this->photo)) {
            $context->buildViolation(ProfilePhoto::MESSAGE)->atPath('photo')->addViolation();
        }
    }
}
