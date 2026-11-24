<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** "PS" : professionnel de santé. Counted once per class via Enrollment. */
#[ORM\Entity]
class Participant
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    public function __construct(
        #[ORM\Column(length: 100)] public string $firstName,
        #[ORM\Column(length: 100)] public string $lastName,
        #[ORM\Column(length: 180, unique: true)] public string $email,
        #[ORM\Column(length: 20, nullable: true)] public ?string $phone = null,
        #[ORM\Column(length: 11, nullable: true)] public ?string $rpps = null,
    ) {
    }

    public function getId(): ?int
    {
        return $this->id;
    }
}
