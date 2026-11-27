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

#[ORM\Entity]
#[ApiResource(operations: [new GetCollection(), new Get()], security: "is_granted('SOFIA_CLASSES')", normalizationContext: ['groups' => ['read']], order: ['date' => 'ASC'])]
class VirtualClass extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    /** @var Collection<int, Enrollment>&Selectable<int, Enrollment> */
    #[ORM\OneToMany(targetEntity: Enrollment::class, mappedBy: 'virtualClass', fetch: 'EXTRA_LAZY')]
    private Collection $enrollments;

    /** @var Collection<int, SessionFormation> every one of them is followed through this class */
    #[ORM\ManyToMany(targetEntity: SessionFormation::class, inversedBy: 'virtualClasses'), ORM\JoinTable(name: 'virtual_class_session_formation')]
    private Collection $sessionFormations;

    // The organization of the sessions: it sends the messages and owns the class.
    #[ORM\ManyToOne, ORM\JoinColumn(nullable: false)]
    private Organization $organization;

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
        ?Organization $organization = null,
    ) {
        $this->organization = $organization ?? $formation->organization;
        $this->enrollments = new ArrayCollection();
        $this->sessionFormations = new ArrayCollection();
    }

    #[Groups('read')]
    public function getId(): ?int
    {
        return $this->id;
    }

    #[Groups('read')]
    public function getOrganization(): Organization
    {
        return $this->organization;
    }

    public function attach(SessionFormation $sessionFormation): void
    {
        if (!$this->sessionFormations->contains($sessionFormation)) {
            $this->sessionFormations->add($sessionFormation);
            $sessionFormation->joinVirtualClass($this);
        }
    }

    /** @return list<SessionFormation> */
    public function sessionFormations(): array
    {
        return array_values($this->sessionFormations->toArray());
    }

    /** @return list<array{id: ?int, sessionId: ?int, session: string, formation: string}> */
    #[Groups('read')]
    public function getSessions(): array
    {
        $items = $this->sessionFormations->toArray();
        // The formation naming the class comes first.
        usort($items, fn (SessionFormation $a, SessionFormation $b): int => [$a->formation !== $this->formation, $a->getId()] <=> [$b->formation !== $this->formation, $b->getId()]);

        return array_map(static fn (SessionFormation $s): array => [
            'id' => $s->getId(), 'sessionId' => $s->session->getId(), 'session' => $s->session->name, 'formation' => $s->formation->title,
        ], $items);
    }

    #[Groups('read')]
    public function getEnrolledCount(): int
    {
        return $this->enrollments->matching(Criteria::create()->where(Criteria::expr()->eq('status', EnrollmentStatus::ACTIVE)))->count();
    }
}
