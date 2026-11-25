<?php

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261125030000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE "user" ADD must_change_password BOOLEAN DEFAULT FALSE NOT NULL, ADD phone VARCHAR(40), ADD job_title VARCHAR(150)');
        $this->addSql('CREATE TABLE user_organization (user_id INT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, organization_id INT NOT NULL REFERENCES organization(id) ON DELETE CASCADE, PRIMARY KEY(user_id, organization_id))');
        $this->addSql('INSERT INTO user_organization SELECT id, organization_id FROM "user" WHERE organization_id IS NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE user_organization');
        $this->addSql('ALTER TABLE "user" DROP must_change_password, DROP phone, DROP job_title');
    }
}
