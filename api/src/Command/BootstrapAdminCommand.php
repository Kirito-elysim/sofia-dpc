<?php

namespace App\Command;

use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand('app:admin:bootstrap', 'Initialise le premier administrateur avec un hachage fourni au déploiement.')]
final class BootstrapAdminCommand extends Command
{
    public function __construct(private Connection $db)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $encodedHash = getenv('SOFIA_BOOTSTRAP_ADMIN_HASH') ?: '';
        if ($encodedHash === '') {
            return Command::SUCCESS;
        }

        $hash = base64_decode($encodedHash, true);
        $email = getenv('SOFIA_BOOTSTRAP_ADMIN_EMAIL') ?: '';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $hash === false || password_get_info($hash)['algoName'] !== 'bcrypt') {
            $output->writeln('<error>Paramètres de création du premier administrateur invalides.</error>');
            return Command::INVALID;
        }

        $created = $this->db->transactional(static function (Connection $db) use ($email, $hash): int {
            $db->executeStatement('LOCK TABLE "user" IN SHARE ROW EXCLUSIVE MODE');
            return $db->executeStatement(
                'INSERT INTO "user" (email, name, password, roles, active)
                 SELECT ?, ?, ?, CAST(? AS json), true WHERE NOT EXISTS (SELECT 1 FROM "user")',
                [strtolower($email), 'Administration Sofia', $hash, '["ROLE_SUPER_ADMIN"]'],
            );
        });
        $output->writeln($created ? 'Premier administrateur créé.' : 'La base contient déjà un utilisateur.');
        return Command::SUCCESS;
    }
}
