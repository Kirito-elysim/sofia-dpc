<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261127140000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE training ADD description TEXT DEFAULT NULL, ADD objectives TEXT DEFAULT NULL, ADD evaluation TEXT DEFAULT NULL, ADD prerequisites TEXT DEFAULT NULL, ADD language TEXT DEFAULT NULL");
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE training DROP description, DROP objectives, DROP evaluation, DROP prerequisites, DROP language');
    }
}
