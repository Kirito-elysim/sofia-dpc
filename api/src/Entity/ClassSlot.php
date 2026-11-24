<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** One half-day of a VirtualClass, with its trainer. Zoom account allocation comes with the class creation task. */
#[ORM\Entity]
#[ORM\UniqueConstraint(columns: ['virtual_class_id', 'time_slot_id'])]
class ClassSlot
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    public function __construct(
        #[ORM\ManyToOne, ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')] public VirtualClass $virtualClass,
        #[ORM\ManyToOne, ORM\JoinColumn(nullable: false)] public TimeSlot $timeSlot,
        #[ORM\ManyToOne] public ?Trainer $trainer = null,
    ) {
    }

    public function getId(): ?int
    {
        return $this->id;
    }
}
