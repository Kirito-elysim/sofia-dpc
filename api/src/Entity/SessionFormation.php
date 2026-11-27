<?php

namespace App\Entity;

use ApiPlatform\Metadata\{ApiResource, Delete, Get, Patch, Post};
use App\State\SessionProcessor;
use App\State\SoftDeleteProcessor;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Context;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Serializer\Normalizer\DateTimeNormalizer;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

/**
 * A formation offered during a session: seats, session numbers per funding and, when they differ from the
 * session, the dates during which learners have access. Enrolments will hang from it.
 */
#[ORM\Entity]
#[ORM\UniqueConstraint(name: 'session_formation_unique', columns: ['session_id', 'formation_id'], options: ['where' => '(deleted_at IS NULL)'])]
#[ApiResource(
    operations: [
        new Get(),
        new Post(processor: SessionProcessor::class, security: "is_granted('SOFIA_SCHEDULE')"),
        new Patch(processor: SessionProcessor::class, security: "is_granted('SOFIA_SCHEDULE')"),
        new Delete(processor: SoftDeleteProcessor::class, security: "is_granted('SOFIA_SCHEDULE')"),
    ],
    security: "is_granted('SOFIA_CLASSES')",
    normalizationContext: ['groups' => ['read']],
    denormalizationContext: ['groups' => ['write']],
)]
class SessionFormation extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'sessionFormations'), ORM\JoinColumn(nullable: false), Groups('write'), Assert\NotNull]
    public Session $session;

    #[ORM\ManyToOne, ORM\JoinColumn(nullable: false), Groups(['read', 'write']), Assert\NotNull]
    public Formation $formation;

    #[ORM\Column, Groups(['read', 'write']), Assert\Positive]
    public int $capacity = 20;

    /** @var array<string, string> session number given by each funder, by funding type */
    #[ORM\Column(type: 'json', options: ['default' => '{}']), Groups(['read', 'write'])]
    #[Assert\Collection(fields: [
        'ANDPC' => new Assert\Optional([new Assert\Type('string'), new Assert\Length(max: 100)]),
        'FIFPL' => new Assert\Optional([new Assert\Type('string'), new Assert\Length(max: 100)]),
        'Personnel' => new Assert\Optional([new Assert\Type('string'), new Assert\Length(max: 100)]),
    ])]
    public array $fundingNumbers = [];

    // Empty: inherited from the session.
    #[ORM\Column(type: 'date_immutable', nullable: true), Groups(['read', 'write']), Context([DateTimeNormalizer::FORMAT_KEY => 'Y-m-d'])]
    public ?\DateTimeImmutable $accessStartsOn = null;

    #[ORM\Column(type: 'date_immutable', nullable: true), Groups(['read', 'write']), Context([DateTimeNormalizer::FORMAT_KEY => 'Y-m-d'])]
    public ?\DateTimeImmutable $accessEndsOn = null;

    /** @var Collection<int, VirtualClass> */
    #[ORM\ManyToMany(targetEntity: VirtualClass::class, mappedBy: 'sessionFormations')]
    private Collection $virtualClasses;

    /** @var Collection<int, Registration> */
    #[ORM\OneToMany(targetEntity: Registration::class, mappedBy: 'sessionFormation')]
    private Collection $registrations;

    public function __construct()
    {
        $this->virtualClasses = new ArrayCollection();
        $this->registrations = new ArrayCollection();
    }

    /** @return list<Registration> by last name */
    public function activeRegistrations(): array
    {
        $active = $this->registrations->filter(static fn (Registration $r): bool => null === $r->getDeletedAt())->toArray();
        usort($active, static fn (Registration $a, Registration $b): int => [$a->participant->lastName, $a->participant->firstName] <=> [$b->participant->lastName, $b->participant->firstName]);

        return $active;
    }

    #[Groups('read')]
    public function getRegisteredCount(): int
    {
        return $this->registrations->filter(static fn (Registration $r): bool => null === $r->getDeletedAt())->count();
    }

    public function joinVirtualClass(VirtualClass $class): void
    {
        if (!$this->virtualClasses->contains($class)) {
            $this->virtualClasses->add($class);
        }
    }

    public function addRegistration(Registration $registration): void
    {
        if (!$this->registrations->contains($registration)) {
            $this->registrations->add($registration);
        }
    }

    #[Groups('read')]
    public function getId(): ?int
    {
        return $this->id;
    }

    /** @return list<VirtualClass> not deleted, soonest first */
    public function plannedClasses(): array
    {
        $classes = $this->virtualClasses->filter(static fn (VirtualClass $c): bool => null === $c->getDeletedAt())->toArray();
        usort($classes, static fn (VirtualClass $a, VirtualClass $b): int => $a->date <=> $b->date);

        return $classes;
    }

    /** @return list<array{id: ?int, date: string, status: string, reference: ?string}> */
    #[Groups('read')]
    public function getClasses(): array
    {
        return array_map(static fn (VirtualClass $c): array => ['id' => $c->getId(), 'date' => $c->date->format('Y-m-d'), 'status' => $c->status->value, 'reference' => $c->reference], $this->plannedClasses());
    }

    #[Groups('read'), Context([DateTimeNormalizer::FORMAT_KEY => 'Y-m-d'])]
    public function getEffectiveAccessStartsOn(): \DateTimeImmutable
    {
        return $this->accessStartsOn ?? $this->session->startsOn;
    }

    #[Groups('read'), Context([DateTimeNormalizer::FORMAT_KEY => 'Y-m-d'])]
    public function getEffectiveAccessEndsOn(): \DateTimeImmutable
    {
        return $this->accessEndsOn ?? $this->session->endsOn;
    }

    #[Assert\Callback]
    public function validate(ExecutionContextInterface $context): void
    {
        $carriers = [$this->formation->organization, ...$this->formation->getAdditionalOrganizations()];
        if (!in_array($this->session->organization, $carriers, true)) {
            $context->buildViolation('Cette formation n’est pas portée par l’organisme de la session.')->atPath('formation')->addViolation();
        }
        // Checked when attaching only: an unpublished formation keeps its past sessions editable.
        if (null === $this->id && !$this->formation->isActive()) {
            $context->buildViolation('Seule une formation publiée peut être rattachée à une session.')->atPath('formation')->addViolation();
        }
        if ($this->getEffectiveAccessEndsOn() < $this->getEffectiveAccessStartsOn()) {
            $context->buildViolation('La fin d’accès précède le début.')->atPath('accessEndsOn')->addViolation();
        }
    }
}
