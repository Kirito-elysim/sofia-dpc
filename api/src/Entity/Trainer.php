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
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/** "Formateur". No Zoom account of their own. */
#[ORM\Entity]
#[UniqueEntity('email')]
#[ApiResource(
    operations: [
        new GetCollection(), new Get(),
        new Post(security: "is_granted('ROLE_ADMIN')"),
        new Patch(security: "is_granted('ROLE_ADMIN')"),
        new Delete(security: "is_granted('ROLE_ADMIN')", processor: SoftDeleteProcessor::class),
    ],
    security: "is_granted('ROLE_LECTURE')",
    normalizationContext: ['groups' => ['read']],
    denormalizationContext: ['groups' => ['write']],
)]
class Trainer extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    /** @var Collection<int, Training> */
    #[ORM\ManyToMany(targetEntity: Training::class)]
    #[ORM\InverseJoinColumn(onDelete: 'CASCADE')]
    #[Groups(['read', 'write'])]
    private Collection $trainings;

    public function __construct(
        #[ORM\Column(length: 100), Groups(['read', 'write', 'user:read']), Assert\NotBlank] public string $firstName,
        #[ORM\Column(length: 100), Groups(['read', 'write', 'user:read']), Assert\NotBlank] public string $lastName,
        #[ORM\Column(length: 180, unique: true), Groups(['read', 'write']), Assert\NotBlank, Assert\Email] public string $email,
        #[ORM\Column(length: 20, nullable: true), Groups(['read', 'write']), Assert\Regex('/^\+?[0-9 .]*$/')] public ?string $phone = null,
        #[ORM\Column(options: ['default' => true]), Groups(['read', 'write'])] public bool $active = true,
        #[ORM\Column(length: 12, nullable: true), Groups(['read', 'write']), Assert\Length(max: 12)] public ?string $civility = null,
        #[ORM\Column(length: 100, nullable: true), Groups(['read', 'write']), Assert\Length(max: 100)] public ?string $specialty = null,
        #[ORM\Column(length: 500, nullable: true), Groups(['read', 'write']), Assert\Length(max: 500)] public ?string $comments = null,
        #[ORM\ManyToOne, Groups(['read', 'write'])] public ?Organization $organization = null,
    ) {
        $this->trainings = new ArrayCollection();
    }

    #[Groups(['read', 'user:read'])]
    public function getId(): ?int
    {
        return $this->id;
    }

    /** @return Collection<int, Training> */
    public function getTrainings(): Collection
    {
        return $this->trainings;
    }

    public function addTraining(Training $t): void
    {
        if (!$this->trainings->contains($t)) {
            $this->trainings->add($t);
        }
    }

    public function removeTraining(Training $t): void
    {
        $this->trainings->removeElement($t);
    }
}
