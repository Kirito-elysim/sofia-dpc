<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261124170100 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE virtual_class ADD schedule_key VARCHAR(36) UNIQUE, ADD schedule_fingerprint VARCHAR(64)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE virtual_class DROP schedule_key, DROP schedule_fingerprint');
    }
}
