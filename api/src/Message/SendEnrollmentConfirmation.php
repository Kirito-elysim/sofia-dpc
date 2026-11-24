<?php

namespace App\Message;

final readonly class SendEnrollmentConfirmation
{
    public function __construct(public int $enrollmentId, public ?string $sentBy = null)
    {
    }
}
