<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261125070000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Statut actif des créneaux';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE time_slot ADD active BOOLEAN DEFAULT TRUE NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE time_slot DROP active');
    }
}
