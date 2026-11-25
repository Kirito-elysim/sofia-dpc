<?php

namespace App\Entity;

use ApiPlatform\Metadata\{ApiResource, Get, GetCollection, Patch, Post};
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity]
#[ApiResource(operations: [
    new GetCollection(paginationEnabled: false), new Get(),
    new Post(security: "is_granted('ROLE_SUPER_ADMIN')"), new Patch(security: "is_granted('ROLE_SUPER_ADMIN')"),
], security: "is_granted('ROLE_SUPER_ADMIN')")]
#[Assert\Expression("this.channel != 'SMS' or this.isSmsLengthValid()", message: 'Le SMS doit rester inférieur à 160 caractères.')]
class MessageTemplate
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    public function getId(): ?int { return $this->id; }

    public function isSmsLengthValid(): bool { return mb_strlen($this->body) < 160; }

    public function __construct(
        #[ORM\Column, Assert\NotBlank, Assert\Length(max: 255)] public string $name,
        #[ORM\Column, Assert\Choice(choices: ['E-mail','SMS'])] public string $channel,
        #[ORM\Column, Assert\NotBlank, Assert\Length(max: 255)] public string $triggerLabel,
        #[ORM\Column, Assert\NotBlank, Assert\Length(max: 255)] public string $organization,
        #[ORM\Column(type: 'text'), Assert\NotBlank] public string $body,
        #[ORM\Column] public bool $active = true,
        #[ORM\Column(nullable: true), Assert\Range(min: 0, max: 525600)] public ?int $minutesBefore = null,
        #[ORM\Column(length: 16), Assert\Choice(choices: ['ALL','CONNECTED','NOT_CONNECTED','NEVER_JOINED'])] public string $presenceRule = 'ALL',
    ) {}
}
