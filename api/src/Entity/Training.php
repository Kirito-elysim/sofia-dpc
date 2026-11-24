<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ApiResource(operations: [new GetCollection(), new Get()], security: "is_granted('ROLE_LECTURE')", normalizationContext: ['groups' => ['read']])]
class Training
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    public function __construct(
        #[ORM\ManyToOne, Groups('read')] public Organization $organization,
        #[ORM\Column(length: 255), Groups('read')] public string $title,
        #[ORM\Column(length: 50, nullable: true)] public ?string $reference = null,
        #[ORM\Column] public int $defaultCapacity = 20,
    ) {
    }

    #[Groups('read')]
    public function getId(): ?int
    {
        return $this->id;
    }
}
