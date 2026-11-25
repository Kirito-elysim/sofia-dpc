<?php

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261125010000 extends AbstractMigration
{
    private const TABLES = ['organization', 'trainer', 'training', 'time_slot', 'organization_document'];

    public function up(Schema $schema): void
    {
        foreach (self::TABLES as $table) {
            $this->addSql("ALTER TABLE $table ADD deleted_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL");
        }
    }

    public function down(Schema $schema): void
    {
        foreach (self::TABLES as $table) {
            $this->addSql("ALTER TABLE $table DROP deleted_at");
        }
    }
}
