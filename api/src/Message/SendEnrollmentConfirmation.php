<?php

namespace App\Message;

final class SendEnrollmentConfirmation
{
    public bool $manualReminder = false;

    public function __construct(public int $enrollmentId, public ?string $sentBy = null, bool $manualReminder = false)
    {
        $this->manualReminder = $manualReminder;
    }
}
