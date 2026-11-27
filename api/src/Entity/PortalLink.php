<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** One-time sign-in link e-mailed to a PS. Only the hash of the token is stored. */
#[ORM\Entity]
class PortalLink extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column(nullable: true)]
    public ?\DateTimeImmutable $usedAt = null;

    public function __construct(
        #[ORM\ManyToOne, ORM\JoinColumn(nullable: false)] public Participant $participant,
        #[ORM\Column(length: 64, unique: true)] public string $tokenHash,
        #[ORM\Column] public \DateTimeImmutable $expiresAt,
    ) {
    }

    public function getId(): ?int
    {
        return $this->id;
    }
}
