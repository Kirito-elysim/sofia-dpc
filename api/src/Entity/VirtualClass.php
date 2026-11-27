<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use App\Enum\ClassStatus;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\Common\Collections\Criteria;
use Doctrine\Common\Collections\Selectable;
use App\Enum\EnrollmentStatus;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

// Slots, trainers and Zoom accounts (ClassSlot) come in the next task.
#[ORM\Entity]
#[ApiResource(operations: [new GetCollection(), new Get()], security: "is_granted('SOFIA_CLASSES')", normalizationContext: ['groups' => ['read']], order: ['date' => 'ASC'])]
class VirtualClass extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    /** @var Collection<int, Enrollment>&Selectable<int, Enrollment> */
    #[ORM\OneToMany(targetEntity: Enrollment::class, mappedBy: 'virtualClass', fetch: 'EXTRA_LAZY')]
    private Collection $enrollments;

    #[ORM\Column(length: 80, nullable: true), Groups('read')]
    public ?string $dpcAction = null;

    #[ORM\Column(length: 80, nullable: true), Groups('read')]
    public ?string $dpcSession = null;

    #[ORM\Column(length: 100, nullable: true), Groups('read')]
    public ?string $reference = null;

    #[ORM\Column(length: 36, nullable: true, unique: true)]
    public ?string $scheduleKey = null;

    #[ORM\Column(length: 64, nullable: true)]
    public ?string $scheduleFingerprint = null;

    public function __construct(
        #[ORM\ManyToOne, Groups('read')] public Formation $formation,
        #[ORM\Column(type: 'date_immutable'), Groups('read')] public \DateTimeImmutable $date,
        #[ORM\Column, Groups('read')] public int $capacity = 20,
        #[ORM\Column(enumType: ClassStatus::class), Groups('read')] public ClassStatus $status = ClassStatus::PLANNED,
    ) {
        $this->enrollments = new ArrayCollection();
    }

    #[Groups('read')]
    public function getId(): ?int
    {
        return $this->id;
    }

    public function getOrganization(): Organization
    {
        return $this->formation->organization;
    }

    #[Groups('read')]
    public function getEnrolledCount(): int
    {
        return $this->enrollments->matching(Criteria::create()->where(Criteria::expr()->eq('status', EnrollmentStatus::ACTIVE)))->count();
    }
}
