<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * "Inscription" of a PS to a session-formation: they follow every virtual class of it. The per-class
 * Enrollment rows (Zoom links, reminders, presence) are derived from it.
 */
#[ORM\Entity]
#[ORM\UniqueConstraint(name: 'registration_unique', columns: ['session_formation_id', 'participant_id'])]
class Registration extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 20, nullable: true)]
    public ?string $funding = null;

    // Empty: inherited from the session-formation.
    #[ORM\Column(type: 'date_immutable', nullable: true)]
    public ?\DateTimeImmutable $accessStartsOn = null;

    #[ORM\Column(type: 'date_immutable', nullable: true)]
    public ?\DateTimeImmutable $accessEndsOn = null;

    public function __construct(
        #[ORM\ManyToOne(inversedBy: 'registrations'), ORM\JoinColumn(nullable: false)] public SessionFormation $sessionFormation,
        #[ORM\ManyToOne, ORM\JoinColumn(nullable: false)] public Participant $participant,
    ) {
        // Keeps the loaded session-formation in step within the same request.
        $sessionFormation->addRegistration($this);
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getEffectiveAccessStartsOn(): \DateTimeImmutable
    {
        return $this->accessStartsOn ?? $this->sessionFormation->getEffectiveAccessStartsOn();
    }

    public function getEffectiveAccessEndsOn(): \DateTimeImmutable
    {
        return $this->accessEndsOn ?? $this->sessionFormation->getEffectiveAccessEndsOn();
    }
}
