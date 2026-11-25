<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261125060000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Fiche formateur : plusieurs organismes, profil détaillé et documents';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE trainer_organization (trainer_id INT NOT NULL REFERENCES trainer(id) ON DELETE CASCADE, organization_id INT NOT NULL REFERENCES organization(id) ON DELETE CASCADE, PRIMARY KEY (trainer_id, organization_id))');
        $this->addSql('CREATE INDEX IDX_TRAINER_ORG_TRAINER ON trainer_organization (trainer_id)');
        $this->addSql('CREATE INDEX IDX_TRAINER_ORG_ORG ON trainer_organization (organization_id)');
        // Habilitation by training disappears: keep every organization a trainer was attached to.
        // The former column and trainer_training table stay in the database, unused.
        $this->addSql('INSERT INTO trainer_organization (trainer_id, organization_id)
            SELECT id, organization_id FROM trainer WHERE organization_id IS NOT NULL
            UNION SELECT tt.trainer_id, t.organization_id FROM trainer_training tt JOIN training t ON t.id = tt.training_id');
        $this->addSql("ALTER TABLE trainer ADD profession VARCHAR(80) DEFAULT NULL, ADD rpps_number VARCHAR(20) DEFAULT NULL, ADD formats JSON DEFAULT '[]' NOT NULL, ADD biography TEXT DEFAULT NULL, ADD photo TEXT DEFAULT NULL, ADD updated_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL");
        $this->addSql('CREATE TABLE trainer_document (trainer_id INT NOT NULL REFERENCES trainer(id) ON DELETE CASCADE, kind VARCHAR(25) NOT NULL, name VARCHAR(255) NOT NULL, mime VARCHAR(40) NOT NULL, content TEXT NOT NULL, deleted_at TIMESTAMP(0) WITHOUT TIME ZONE DEFAULT NULL, PRIMARY KEY (trainer_id, kind))');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE trainer_document');
        $this->addSql('ALTER TABLE trainer DROP profession, DROP rpps_number, DROP formats, DROP biography, DROP photo, DROP updated_at');
        $this->addSql('DROP TABLE trainer_organization');
    }
}
