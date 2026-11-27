<?php

namespace App\Entity;

use ApiPlatform\Metadata\{ApiResource, Get, GetCollection, Patch, Post};
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity]
#[UniqueEntity('hostUserId')]
#[ApiResource(operations: [new GetCollection(), new Get(), new Post(), new Patch()], security: "is_granted('ROLE_SUPER_ADMIN')")]
class ZoomAccount extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column(nullable: true)]
    private ?int $oauthConnectionId = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $sealedCredentials = null;

    public function sealedCredentials(): ?string { return $this->sealedCredentials; }

    public function oauthConnectionId(): ?int { return $this->oauthConnectionId; }

    public function __construct(
        #[ORM\Column(length: 100), Assert\NotBlank, Assert\Length(max: 100)] public string $label,
        #[ORM\Column(length: 180, unique: true), Assert\NotBlank, Assert\Length(max: 180)] public string $hostUserId,
        #[ORM\Column(length: 50), Assert\Regex('/^[A-Z0-9_]{1,50}$/'), Assert\NotBlank] public string $profile,
        #[ORM\Column] public bool $active = true,
    ) {}

    public function getId(): ?int { return $this->id; }
}
