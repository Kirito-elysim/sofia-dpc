<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** Append-only: the application never updates or deletes rows. */
#[ORM\Entity]
class AuditLog
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    public \DateTimeImmutable $at;

    /** @var array<string, mixed>|null method, path and cleaned payload of the HTTP request */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $request = null;

    /** @param array<string, mixed> $data */
    public function __construct(
        #[ORM\Column(length: 180, nullable: true)] public ?string $userEmail,
        #[ORM\Column(length: 50)] public string $action,
        #[ORM\Column(length: 50, nullable: true)] public ?string $entity = null,
        #[ORM\Column(nullable: true)] public ?int $entityId = null,
        #[ORM\Column(type: 'json')] public array $data = [],
        #[ORM\Column(length: 45, nullable: true)] public ?string $ip = null,
        // Name of the record at the time of the event: it stays readable after a rename or a deletion.
        #[ORM\Column(length: 255, nullable: true)] public ?string $label = null,
    ) {
        $this->at = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }
}
