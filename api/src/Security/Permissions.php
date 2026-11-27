<?php

namespace App\Security;

use App\Entity\User;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

/** @extends Voter<string, mixed> */
final class Permissions extends Voter
{
    public const READ = [
        'DASHBOARD' => 'Tableau de bord', 'PLANNING' => 'Planning',
        'CLASSES' => 'Classes virtuelles', 'LEARNERS' => 'Participants',
        'LIVE' => 'Suivi en direct', 'FORMATIONS' => 'Formations',
        'TRAINERS' => 'Formateurs', 'TIME_SLOTS' => 'Créneaux',
        'ORGANIZATIONS' => 'Organismes', 'CONFIGS' => 'Configurations des classes virtuelles',
    ];
    public const WRITE = [
        'SCHEDULE' => 'Planifier les classes', 'ENROLL' => 'Gérer les inscriptions',
        'REMIND' => 'Envoyer des relances', 'EDIT_FORMATIONS' => 'Gérer les formations',
        'EDIT_TRAINERS' => 'Gérer les formateurs', 'EDIT_ORGANIZATIONS' => 'Modifier les organismes',
        'EDIT_CONFIGS' => 'Gérer les configurations',
    ];

    public const DEPENDENCIES = [
        'SCHEDULE' => ['CLASSES', 'PLANNING', 'FORMATIONS', 'TRAINERS', 'TIME_SLOTS'],
        'ENROLL' => ['CLASSES'],
        'EDIT_FORMATIONS' => ['FORMATIONS'],
        'EDIT_TRAINERS' => ['TRAINERS', 'FORMATIONS'],
        'EDIT_ORGANIZATIONS' => ['ORGANIZATIONS'],
        'EDIT_CONFIGS' => ['CONFIGS'],
    ];

    /**
     * @param array<string> $permissions
     *
     * @return list<string>
     */
    public static function expand(array $permissions): array
    {
        $expanded = $permissions;
        foreach ($permissions as $permission) {
            array_push($expanded, ...(self::DEPENDENCIES[$permission] ?? []));
        }
        return array_values(array_unique($expanded));
    }

    /** @return list<string> */
    public static function forUser(User $user): array
    {
        if ($user->customRole) {
            return self::expand($user->customRole->permissions);
        }
        $read = array_keys(self::READ);
        return match ($user->getRole()) {
            'ROLE_SUPER_ADMIN' => [...$read, ...array_keys(self::WRITE), 'GLOBAL'],
            'ROLE_ADMIN' => [...$read, ...array_keys(self::WRITE)],
            'ROLE_SUIVI' => [...array_diff($read, ['CONFIGS']), 'ENROLL', 'REMIND'],
            'ROLE_LECTURE' => array_values(array_diff($read, ['CONFIGS'])),
            default => [],
        };
    }

    protected function supports(string $attribute, mixed $subject): bool
    {
        return str_starts_with($attribute, 'SOFIA_');
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
    {
        $user = $token->getUser();
        return $user instanceof User && in_array(substr($attribute, 6), self::forUser($user), true);
    }
}
