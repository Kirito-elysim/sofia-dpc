<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

#[ORM\Entity]
#[ORM\Table(name: '"user"')]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    /** @param list<string> $roles SUPER_ADMIN, ADMIN, SUIVI, LECTURE (as ROLE_*) */
    public function __construct(
        #[ORM\Column(length: 180, unique: true)] public string $email,
        #[ORM\Column(length: 150)] public string $name,
        #[ORM\Column] public string $password,
        #[ORM\Column(type: 'json')] public array $roles = ['ROLE_LECTURE'],
    ) {
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUserIdentifier(): string
    {
        return $this->email;
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function getRoles(): array
    {
        return array_unique([...$this->roles, 'ROLE_USER']);
    }

    public function eraseCredentials(): void
    {
    }
}
