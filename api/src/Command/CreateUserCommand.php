<?php

namespace App\Command;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

#[AsCommand('app:user:create', 'Creates a user (role: SUPER_ADMIN, ADMIN, SUIVI or LECTURE)')]
class CreateUserCommand extends Command
{
    public function __construct(private EntityManagerInterface $em, private UserPasswordHasherInterface $hasher)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('email', InputArgument::REQUIRED)->addArgument('name', InputArgument::REQUIRED)
            ->addArgument('password', InputArgument::REQUIRED)->addArgument('role', InputArgument::OPTIONAL, '', 'SUIVI');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $role = strtoupper($input->getArgument('role'));
        if (!in_array($role, ['SUPER_ADMIN', 'ADMIN', 'SUIVI', 'LECTURE'], true)) {
            $output->writeln('<error>Rôle invalide.</error>');

            return Command::INVALID;
        }
        $user = new User($input->getArgument('email'), $input->getArgument('name'), '', ['ROLE_'.$role]);
        $user->password = $this->hasher->hashPassword($user, $input->getArgument('password'));
        $this->em->persist($user);
        $this->em->flush();
        $output->writeln('Utilisateur créé.');

        return Command::SUCCESS;
    }
}
