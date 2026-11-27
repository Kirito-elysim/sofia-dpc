<?php

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\State\SoftDeleteProcessor;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\String\Slugger\AsciiSlugger;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

/** "Formation". */
#[ORM\Entity]
#[ApiResource(
    operations: [
        new GetCollection(), new Get(),
        new Post(processor: \App\State\ScopedCatalogProcessor::class, security: "is_granted('SOFIA_EDIT_FORMATIONS')"),
        new Patch(processor: \App\State\ScopedCatalogProcessor::class, security: "is_granted('SOFIA_EDIT_FORMATIONS')"),
        new Delete(security: "is_granted('SOFIA_EDIT_FORMATIONS')", processor: SoftDeleteProcessor::class),
    ],
    security: "is_granted('SOFIA_FORMATIONS')",
    normalizationContext: ['groups' => ['read', 'formation:image']],
    denormalizationContext: ['groups' => ['write']],
)]
class Formation extends SoftDeletable
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    /** @var list<string> */
    #[ORM\Column(type: 'json', options: ['default' => '[]']), Groups(['read', 'write'])]
    #[Assert\Choice(choices: ['ANDPC', 'FIFPL', 'Personnel'], multiple: true)]
    public array $fundingTypes = [];

    #[ORM\Column(length: 100, nullable: true), Groups('write'), Assert\Length(max: 100)]
    public ?string $audience = null;

    // Amounts and hours travel as decimal strings. Drafts may leave anything but the year empty.
    private const AMOUNT = '/\A\d{1,8}(\.\d{1,2})?\z/';

    /** @var list<array<string, int|string>> DPC action number, price and support per organization and year */
    #[ORM\Column(type: 'json', options: ['default' => '[]']), Groups(['read', 'write'])]
    #[Assert\All([new Assert\Collection(fields: [
        'organization' => new Assert\Optional([new Assert\Type('integer'), new Assert\Positive()]),
        'year' => [new Assert\Type('integer'), new Assert\Range(min: 1000, max: 9999)],
        'code' => new Assert\Optional([new Assert\Type('string'), new Assert\Length(max: 100)]),
        'priceHT' => new Assert\Optional([new Assert\Type('string'), new Assert\Regex(self::AMOUNT)]),
        'andpcSupport' => new Assert\Optional([new Assert\Type('string'), new Assert\Regex(self::AMOUNT)]),
    ])])]
    public array $andpcCodes = [];

    /** @var list<array<string, int|string>> FIFPL code, hours and price per organization and year */
    #[ORM\Column(type: 'json', options: ['default' => '[]']), Groups(['read', 'write'])]
    #[Assert\All([new Assert\Collection(fields: [
        'organization' => new Assert\Optional([new Assert\Type('integer'), new Assert\Positive()]),
        'year' => [new Assert\Type('integer'), new Assert\Range(min: 1000, max: 9999)],
        'code' => new Assert\Optional([new Assert\Type('string'), new Assert\Length(max: 100)]),
        'priceHT' => new Assert\Optional([new Assert\Type('string'), new Assert\Regex(self::AMOUNT)]),
        'durationHours' => new Assert\Optional([new Assert\Type('string'), new Assert\Regex(self::AMOUNT)]),
    ])])]
    public array $fifplCodes = [];

    /** @var list<array<string, int|string>> self-funded prices per organization and year */
    #[ORM\Column(type: 'json', options: ['default' => '[]']), Groups(['read', 'write'])]
    #[Assert\All([new Assert\Collection(fields: [
        'organization' => new Assert\Optional([new Assert\Type('integer'), new Assert\Positive()]),
        'year' => [new Assert\Type('integer'), new Assert\Range(min: 1000, max: 9999)],
        'priceHT' => new Assert\Optional([new Assert\Type('string'), new Assert\Regex(self::AMOUNT)]),
        'priceTTC' => new Assert\Optional([new Assert\Type('string'), new Assert\Regex(self::AMOUNT)]),
    ])])]
    public array $personalPrices = [];

    #[ORM\Column(type: 'text', nullable: true), Groups(['formation:image', 'write'])]
    #[Assert\Length(max: 200000)]
    #[Assert\Regex(pattern: '~\Adata:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}\z~D', message: 'La vignette doit être une image JPEG.')]
    public ?string $thumbnail = null;

    #[ORM\Column(length: 32, nullable: true), Groups(['read', 'write'])]
    #[Assert\Choice(choices: ['À distance', 'Classe virtuelle', 'Mixte', 'Présentiel'])]
    public ?string $modality = null;

    #[ORM\Column(length: 16, options: ['default' => 'draft']), Groups(['read', 'write'])]
    // unpublished: complete but not offered, and inactive. draft: still in the creation steps.
    #[Assert\Choice(choices: ['draft', 'unpublished', 'published', 'archived'])]
    public string $publicationStatus = 'draft';

    #[ORM\Column(type: 'text', nullable: true), Groups(['read', 'write']), Assert\Length(max: 5000)]
    public ?string $description = null;

    #[ORM\Column(length: 255, nullable: true), Groups(['read', 'write']), Assert\Length(max: 255)]
    public ?string $orientation = null;

    #[ORM\Column(type: 'text', nullable: true), Groups(['read', 'write']), Assert\Length(max: 5000)]
    public ?string $objectives = null;

    #[ORM\Column(type: 'text', nullable: true), Groups(['read', 'write']), Assert\Length(max: 5000)]
    public ?string $evaluation = null;

    #[ORM\Column(type: 'text', nullable: true), Groups(['read', 'write']), Assert\Length(max: 5000)]
    public ?string $prerequisites = null;

    #[ORM\Column(type: 'text', nullable: true), Groups(['read', 'write']), Assert\Length(max: 5000)]
    public ?string $language = null;

    #[ORM\ManyToOne, Groups(['read', 'write'])]
    public ?TargetAudience $targetAudience = null;

    /** @var \Doctrine\Common\Collections\Collection<int, Organization> */
    #[ORM\ManyToMany(targetEntity: Organization::class), ORM\JoinTable(name: 'formation_additional_organization')]
    private \Doctrine\Common\Collections\Collection $additionalOrganizations;

    // The formation's own part of the reference; its title is used when empty.
    #[ORM\Column(length: 255, nullable: true), Groups(['read', 'write']), Assert\Length(max: 255)]
    public ?string $acronym = null;

    // In euros, kept as a decimal string: no float rounding on money.
    #[ORM\Column(type: 'decimal', precision: 10, scale: 2, nullable: true), Groups(['read', 'write'])]
    #[Assert\Regex('/\A\d{1,8}(\.\d{1,2})?\z/', message: 'Prix invalide.')]
    public ?string $price = null;

    public function __construct(
        #[ORM\ManyToOne, ORM\JoinColumn(nullable: false), Groups(['read', 'write']), Assert\NotNull] public Organization $organization,
        #[ORM\Column(length: 255), Groups(['read', 'write']), Assert\NotBlank, Assert\Length(max: 255)] public string $title,
        #[ORM\Column(length: 300, nullable: true)] private ?string $reference = null,
        #[ORM\Column(nullable: true), Groups(['read', 'write']), Assert\Positive] public ?int $totalDurationMin = null,
        // Default seat count copied onto each new class (20 today, variable per formation).
        #[ORM\Column, Groups(['read', 'write']), Assert\Positive] public int $defaultCapacity = 20,
    ) {
        $this->additionalOrganizations = new \Doctrine\Common\Collections\ArrayCollection();
    }

    #[Assert\Callback]
    public function validateFundingOrganizations(ExecutionContextInterface $context): void
    {
        $ids = [$this->organization->getId(), ...$this->additionalOrganizations->map(static fn (Organization $o) => $o->getId())->toArray()];
        foreach (['andpcCodes' => $this->andpcCodes, 'fifplCodes' => $this->fifplCodes, 'personalPrices' => $this->personalPrices] as $path => $rows) {
            foreach ($rows as $row) {
                // Codes entered before they were tied to an organization have none.
                if (isset($row['organization']) && !in_array($row['organization'], $ids, true)) {
                    $context->buildViolation('Un financement concerne un organisme qui ne porte pas cette formation.')->atPath($path)->addViolation();

                    return;
                }
            }
        }
    }

    /** @return \Doctrine\Common\Collections\Collection<int, Organization> */
    #[Groups(['read', 'write'])]
    public function getAdditionalOrganizations(): \Doctrine\Common\Collections\Collection
    {
        return $this->additionalOrganizations;
    }

    public function addAdditionalOrganization(Organization $organization): void
    {
        if (!$this->additionalOrganizations->contains($organization)) {
            $this->additionalOrganizations->add($organization);
        }
    }

    public function removeAdditionalOrganization(Organization $organization): void
    {
        $this->additionalOrganizations->removeElement($organization);
    }

    #[Groups('read')]
    public function getAudience(): ?string
    {
        return $this->targetAudience->name ?? $this->audience;
    }

    #[Groups('read')]
    public function getReference(): ?string
    {
        return $this->reference;
    }

    /**
     * Generated on every save: audience acronym, then formation acronym (or title slug).
     * Without an audience or a name the previous value is kept.
     */
    public function refreshReference(): void
    {
        $slugger = new AsciiSlugger('fr');
        $prefix = $slugger->slug($this->targetAudience->acronym ?? '')->upper()->toString();
        // Audiences created before the acronym existed (or free text) fall back to their initial.
        if ('' === $prefix && preg_match('/\p{L}/u', $this->targetAudience->name ?? $this->audience ?? '', $initial)) {
            $prefix = mb_strtoupper($initial[0]);
        }
        $own = $slugger->slug($this->acronym ?? '')->upper()->toString() ?: $slugger->slug($this->title)->lower()->toString();
        if ('' !== $prefix && '' !== $own) {
            $this->reference = mb_substr($prefix.'-'.$own, 0, 300);
        }
    }

    /** Only a published formation can receive classes: there is no separate switch. */
    #[Groups('read')]
    public function isActive(): bool
    {
        return 'published' === $this->publicationStatus;
    }

    #[Groups('read')]
    public function getId(): ?int
    {
        return $this->id;
    }
}
