<?php

namespace App\Dto;

use Symfony\Component\Validator\Constraints as Assert;

final class RegistrationInput
{
    public function __construct(
        #[Assert\NotBlank, Assert\Length(max: 100)] public string $firstName = '',
        #[Assert\NotBlank, Assert\Length(max: 100)] public string $lastName = '',
        #[Assert\NotBlank, Assert\Email, Assert\Length(max: 180)] public string $email = '',
        #[Assert\Length(max: 20), Assert\Regex('/^\+?[0-9 .]*$/')] public ?string $phone = null,
        #[Assert\Regex('/^[0-9]{11}$/', message: 'Le RPPS doit contenir 11 chiffres.')] public ?string $rpps = null,
        #[Assert\Length(max: 20)] public ?string $funding = null,
        #[Assert\Date] public ?string $accessStartsOn = null,
        #[Assert\Date] public ?string $accessEndsOn = null,
    ) {
    }
}
