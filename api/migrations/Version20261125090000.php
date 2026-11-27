<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261125090000 extends AbstractMigration
{
    private const TABLES = ['class_slot', 'custom_role', 'enrollment', 'message_log', 'message_template', 'participant',
        'virtual_class', 'zoom_account', 'virtual_class_config', 'organization_draft'];

    public function getDescription(): string
    {
        return 'Date de suppression sur toutes les entités';
    }

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
