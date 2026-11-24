<?php

namespace App\Command;

use App\Entity\Organization;
use App\Entity\Training;
use App\Entity\VirtualClass;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/** Fictitious data only. Sender addresses come from SEED_SOFIA_FROM / SEED_PHOCEA_FROM (your Gmail address). */
#[AsCommand('app:seed-demo', 'Creates the two organizations, trainings and demo classes')]
class SeedDemoCommand extends Command
{
    public function __construct(private EntityManagerInterface $em)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $from = $_ENV['SEED_SOFIA_FROM'] ?? 'sofia@example.test';
        $sofia = new Organization('SOFIA', 'SOFIA', $from, 'SOFIA');
        $phocea = new Organization('STUDIO PHOCEA', 'PHOCEA', $_ENV['SEED_PHOCEA_FROM'] ?? $from, 'PHOCEA');
        $trainings = [
            new Training($sofia, 'Antibiothérapie en ville', 'DEMO-001'),
            new Training($phocea, 'Prise en charge du diabète de type 2', 'DEMO-002'),
        ];
        foreach ([$sofia, $phocea, ...$trainings] as $o) {
            $this->em->persist($o);
        }
        foreach ($trainings as $i => $t) {
            $this->em->persist(new VirtualClass($t, new \DateTimeImmutable('+'.(7 + $i).' days'), $t->defaultCapacity));
        }
        $this->em->flush();
        $output->writeln('Données de démonstration créées.');

        return Command::SUCCESS;
    }
}
