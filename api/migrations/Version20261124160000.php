<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261124160000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE training ADD active BOOLEAN DEFAULT TRUE NOT NULL, ADD theme VARCHAR(100)');
        $this->addSql('ALTER TABLE trainer ADD active BOOLEAN DEFAULT TRUE NOT NULL, ADD civility VARCHAR(12), ADD specialty VARCHAR(100), ADD comments VARCHAR(500), ADD organization_id INT REFERENCES organization(id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE training DROP active, DROP theme');
        $this->addSql('ALTER TABLE trainer DROP active, DROP civility, DROP specialty, DROP comments, DROP organization_id');
    }
}
