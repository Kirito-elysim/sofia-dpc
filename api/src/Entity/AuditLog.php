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

    /** @param array<string, mixed> $data */
    public function __construct(
        #[ORM\Column(length: 180, nullable: true)] public ?string $userEmail,
        #[ORM\Column(length: 50)] public string $action,
        #[ORM\Column(length: 50, nullable: true)] public ?string $entity = null,
        #[ORM\Column(nullable: true)] public ?int $entityId = null,
        #[ORM\Column(type: 'json')] public array $data = [],
        #[ORM\Column(length: 45, nullable: true)] public ?string $ip = null,
    ) {
        $this->at = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }
}
