<?php

namespace App\Message;

final readonly class ZoomCapacityAlert
{
    public function __construct(public int $trainingId, public string $day, public string $slot) {}
}
