<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/** "Formation". */
#[ORM\Entity]
#[ApiResource(
    operations: [
        new GetCollection(), new Get(),
        new Post(security: "is_granted('ROLE_ADMIN')"),
        new Patch(security: "is_granted('ROLE_ADMIN')"),
        new Delete(security: "is_granted('ROLE_ADMIN')"),
    ],
    security: "is_granted('ROLE_LECTURE')",
    normalizationContext: ['groups' => ['read']],
    denormalizationContext: ['groups' => ['write']],
)]
class Training
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    public function __construct(
        #[ORM\ManyToOne, ORM\JoinColumn(nullable: false), Groups(['read', 'write']), Assert\NotNull] public Organization $organization,
        #[ORM\Column(length: 255), Groups(['read', 'write']), Assert\NotBlank, Assert\Length(max: 255)] public string $title,
        #[ORM\Column(length: 50, nullable: true), Groups(['read', 'write']), Assert\Length(max: 50)] public ?string $reference = null,
        #[ORM\Column(nullable: true), Groups(['read', 'write']), Assert\Positive] public ?int $totalDurationMin = null,
        // Default seat count copied onto each new class (20 today, variable per training).
        #[ORM\Column, Groups(['read', 'write']), Assert\Positive] public int $defaultCapacity = 20,
    ) {
    }

    #[Groups('read')]
    public function getId(): ?int
    {
        return $this->id;
    }
}
