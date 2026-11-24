<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** History of mails/SMS shown on the participant sheet (proof that a PS was notified). */
#[ORM\Entity]
class MessageLog
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    public \DateTimeImmutable $at;

    public function __construct(
        #[ORM\ManyToOne] public Enrollment $enrollment,
        #[ORM\Column(length: 10)] public string $channel,
        #[ORM\Column(length: 50)] public string $kind,
        #[ORM\Column(length: 180)] public string $recipient,
        #[ORM\Column(length: 10)] public string $status,
        #[ORM\Column(type: 'text', nullable: true)] public ?string $error = null,
        #[ORM\Column(length: 100, nullable: true)] public ?string $sentBy = null,
    ) {
        $this->at = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }
}
