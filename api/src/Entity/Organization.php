<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity]
#[UniqueEntity('code')]
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
class Organization
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    public function __construct(
        #[ORM\Column(length: 100), Groups(['read', 'write', 'user:read']), Assert\NotBlank, Assert\Length(max: 100)] public string $name,
        #[ORM\Column(length: 20, unique: true), Groups(['read', 'write', 'user:read']), Assert\NotBlank, Assert\Regex('/^[A-Z0-9_]{2,20}$/', message: 'Majuscules, chiffres et _ uniquement.')] public string $code,
        // Gmail only accepts the authenticated account (or a configured alias) as sender.
        #[ORM\Column(length: 180), Groups(['read', 'write']), Assert\NotBlank, Assert\Email] public string $emailFrom,
        // Max 11 alphanumeric chars (OVH sender rule).
        #[ORM\Column(length: 11, nullable: true), Groups(['read', 'write']), Assert\Regex('/^[A-Za-z0-9]{1,11}$/', message: '11 caractères alphanumériques maximum.')] public ?string $smsSender = null,
        #[ORM\Column(length: 14, nullable: true), Groups(['read', 'write']), Assert\Regex('/^[0-9]{14}$/', message: 'Le SIRET contient 14 chiffres.')] public ?string $siret = null,
        #[ORM\Column(length: 30, nullable: true), Groups(['read', 'write']), Assert\Length(max: 30)] public ?string $andpcNumber = null,
        #[ORM\Column, Groups(['read', 'write'])] public bool $active = true,
        #[ORM\Column(length: 12, nullable: true), Groups(['read', 'write']), Assert\Choice(choices: ['blue', 'purple', 'gray'])] public ?string $color = null,
    ) {
    }

    #[Groups(['read', 'user:read'])]
    public function getId(): ?int
    {
        return $this->id;
    }
}
