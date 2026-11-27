<?php

namespace App\Entity;

use ApiPlatform\Metadata\{ApiResource, Delete, Get, GetCollection, Patch, Post};
use App\State\SessionProcessor;
use App\State\SoftDeleteProcessor;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Context;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Serializer\Normalizer\DateTimeNormalizer;
use Symfony\Component\Validator\Constraints as Assert;

/** A period (start, end) of one organization. Formations are attached to it through SessionFormation. */
#[ORM\Entity]
#[ApiResource(
    operations: [
        new GetCollection(), new Get(),
        new Post(processor: SessionProcessor::class, security: "is_granted('SOFIA_SCHEDULE')"),
        new Patch(processor: SessionProcessor::class, security: "is_granted('SOFIA_SCHEDULE')"),
        new Delete(processor: SoftDeleteProcessor::class, security: "is_granted('SOFIA_SCHEDULE')"),
    ],
    security: "is_granted('SOFIA_CLASSES')",
    normalizationContext: ['groups' => ['read']],
    denormalizationContext: ['groups' => ['write']],
    order: ['startsOn' => 'DESC'],
)]
class Session extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    /** @var Collection<int, SessionFormation> */
    #[ORM\OneToMany(targetEntity: SessionFormation::class, mappedBy: 'session')]
    private Collection $sessionFormations;

    public function __construct(
        #[ORM\ManyToOne, ORM\JoinColumn(nullable: false), Groups(['read', 'write']), Assert\NotNull] public Organization $organization,
        #[ORM\Column(length: 150), Groups(['read', 'write']), Assert\NotBlank, Assert\Length(max: 150)] public string $name,
        #[ORM\Column(type: 'date_immutable'), Groups(['read', 'write']), Context([DateTimeNormalizer::FORMAT_KEY => 'Y-m-d'])] public \DateTimeImmutable $startsOn,
        #[ORM\Column(type: 'date_immutable'), Groups(['read', 'write']), Context([DateTimeNormalizer::FORMAT_KEY => 'Y-m-d'])]
        #[Assert\GreaterThanOrEqual(propertyPath: 'startsOn', message: 'La date de fin précède la date de début.')]
        public \DateTimeImmutable $endsOn,
    ) {
        $this->sessionFormations = new ArrayCollection();
    }

    #[Groups('read')]
    public function getId(): ?int
    {
        return $this->id;
    }

    /** @return list<SessionFormation> */
    #[Groups('read')]
    public function getSessionFormations(): array
    {
        return array_values($this->sessionFormations->filter(static fn (SessionFormation $f): bool => null === $f->getDeletedAt())->toArray());
    }
}
