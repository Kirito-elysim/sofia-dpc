<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity]
#[ApiResource(operations: [new GetCollection(), new Get()], security: "is_granted('ROLE_LECTURE')", normalizationContext: ['groups' => ['read']])]
class Organization
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    public function __construct(
        #[ORM\Column(length: 100), Groups('read')] public string $name,
        #[ORM\Column(length: 20, unique: true), Groups('read')] public string $code,
        // Gmail only accepts the authenticated account (or a configured alias) as sender.
        #[ORM\Column(length: 180)] public string $emailFrom,
        #[ORM\Column(length: 11, nullable: true)] public ?string $smsSender = null,
    ) {
    }

    #[Groups('read')]
    public function getId(): ?int
    {
        return $this->id;
    }
}
