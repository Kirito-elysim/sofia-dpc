<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * A file or a link offered to learners. Attached to a formation (every session gets it) or to one
 * session-formation (an addition for that session only).
 */
#[ORM\Entity]
class LearningResource extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    public ?Formation $formation = null;

    #[ORM\ManyToOne]
    public ?SessionFormation $sessionFormation = null;

    #[ORM\Column(length: 500, nullable: true)]
    public ?string $url = null;

    #[ORM\Column(length: 255, nullable: true)]
    public ?string $fileName = null;

    #[ORM\Column(length: 100, nullable: true)]
    public ?string $mime = null;

    // Base64, as the other documents of the application.
    #[ORM\Column(type: 'text', nullable: true)]
    public ?string $content = null;

    public function __construct(#[ORM\Column(length: 150)] public string $title)
    {
    }

    public function getId(): ?int
    {
        return $this->id;
    }
}
