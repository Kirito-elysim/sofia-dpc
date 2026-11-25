<?php

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261125000000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE organization_profile (organization_id INT PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE, details JSONB NOT NULL)');
        $this->addSql('CREATE TABLE organization_document (organization_id INT REFERENCES organization(id) ON DELETE CASCADE, kind VARCHAR(25) NOT NULL, name VARCHAR(255) NOT NULL, mime VARCHAR(40) NOT NULL, content TEXT NOT NULL, PRIMARY KEY (organization_id,kind))');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE organization_document');
        $this->addSql('DROP TABLE organization_profile');
    }
}
