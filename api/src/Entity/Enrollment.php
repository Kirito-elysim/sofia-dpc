<?php

namespace App\Entity;

use App\Enum\EnrollmentStatus;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\UniqueConstraint(columns: ['virtual_class_id', 'participant_id'])]
class Enrollment extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column(enumType: EnrollmentStatus::class)]
    public EnrollmentStatus $status = EnrollmentStatus::ACTIVE;

    #[ORM\Column]
    public \DateTimeImmutable $createdAt;

    public function __construct(
        #[ORM\ManyToOne, ORM\JoinColumn(nullable: false)] public VirtualClass $virtualClass,
        #[ORM\ManyToOne] public Participant $participant,
        // Filled by the Zoom integration (next task).
        #[ORM\Column(length: 500, nullable: true)] public ?string $joinUrl = null,
    ) {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }
}
