<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261125080000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Suppression logique des comptes utilisateurs';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE "user" ADD deleted_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE "user" DROP deleted_at');
    }
}
