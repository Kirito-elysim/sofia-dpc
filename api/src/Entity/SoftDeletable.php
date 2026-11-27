<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\MappedSuperclass]
abstract class SoftDeletable
{
    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $deletedAt = null;

    #[Groups(['read', 'user:read'])]
    public function getDeletedAt(): ?\DateTimeImmutable
    {
        return $this->deletedAt;
    }

    public function markDeleted(): void
    {
        $this->deletedAt ??= new \DateTimeImmutable();
    }

    /** For the few records that can come back, such as a reactivated enrollment. */
    public function restore(): void
    {
        $this->deletedAt = null;
    }
}
