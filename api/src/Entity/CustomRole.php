<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class CustomRole extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    /** @param list<string> $permissions */
    public function __construct(
        #[ORM\Column(length: 100, unique: true)] public string $name,
        #[ORM\Column] public array $permissions,
    ) {}
}
