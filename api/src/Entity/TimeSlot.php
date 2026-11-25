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
use Symfony\Component\Validator\Constraints as Assert;

/** "Créneau" (morning 09:00-13:00, afternoon 14:00-17:00, ...). Times are "HH:MM" strings, Europe/Paris. */
#[ORM\Entity]
#[Assert\Expression('this.endTime > this.startTime', message: "L'heure de fin doit suivre l'heure de début.")]
#[ApiResource(
    operations: [
        new GetCollection(), new Get(),
        new Post(security: "is_granted('ROLE_ADMIN')"),
        new Patch(security: "is_granted('ROLE_ADMIN')"),
        new Delete(security: "is_granted('ROLE_ADMIN')", processor: SoftDeleteProcessor::class),
    ],
    security: "is_granted('ROLE_LECTURE')",
    normalizationContext: ['groups' => ['read']],
    denormalizationContext: ['groups' => ['write']],
)]
class TimeSlot extends SoftDeletable
{
    private const HHMM = '/^([01][0-9]|2[0-3]):[0-5][0-9]$/';

    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    public function __construct(
        #[ORM\Column(length: 50), Groups(['read', 'write']), Assert\NotBlank, Assert\Length(max: 50)] public string $label,
        #[ORM\Column(length: 5), Groups(['read', 'write']), Assert\Regex(self::HHMM, message: 'Format HH:MM.')] public string $startTime,
        #[ORM\Column(length: 5), Groups(['read', 'write']), Assert\Regex(self::HHMM, message: 'Format HH:MM.')] public string $endTime,
    ) {
    }

    #[Groups('read')]
    public function getId(): ?int
    {
        return $this->id;
    }

    #[Groups('read')]
    public function getDurationMin(): int
    {
        [$sh, $sm] = array_map('intval', explode(':', $this->startTime));
        [$eh, $em] = array_map('intval', explode(':', $this->endTime));

        return max(0, ($eh * 60 + $em) - ($sh * 60 + $sm));
    }
}
