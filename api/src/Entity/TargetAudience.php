<?php

namespace App\Entity;

use ApiPlatform\Metadata\{ApiResource, Delete, Get, GetCollection, Patch, Post};
use App\State\SoftDeleteProcessor;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity]
#[ApiResource(
    operations: [new GetCollection(), new Get(), new Post(), new Patch(), new Delete(processor: SoftDeleteProcessor::class)],
    security: "is_granted('SOFIA_EDIT_FORMATIONS')",
    normalizationContext: ['groups' => ['read']],
    denormalizationContext: ['groups' => ['write']],
)]
class TargetAudience extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column, Groups('read')]
    public ?int $id = null;

    #[ORM\Column(length: 100), Groups(['read', 'write']), Assert\NotBlank, Assert\Length(max: 100)]
    public string $name = '';

    #[ORM\Column(length: 20, options: ['default' => '']), Groups(['read', 'write']), Assert\NotBlank, Assert\Length(max: 20)]
    public string $acronym = '';
}
