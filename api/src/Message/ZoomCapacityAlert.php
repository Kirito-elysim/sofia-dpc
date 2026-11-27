<?php

namespace App\Message;

final readonly class ZoomCapacityAlert
{
    public function __construct(public int $formationId, public string $day, public string $slot, public ?int $organizationId = null) {}
}
