<?php

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final class RegistrationChange
{
    public function __construct(
        #[Assert\Length(max: 20)] public ?string $funding = null,
        #[Assert\Date] public ?string $accessStartsOn = null,
        #[Assert\Date] public ?string $accessEndsOn = null,
    ) {
    }
}
