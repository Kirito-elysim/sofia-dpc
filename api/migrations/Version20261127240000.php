<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** The formation category is not used for now. */
final class Version20261127240000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE formation DROP theme');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE formation ADD theme VARCHAR(100) DEFAULT NULL');
    }
}
