<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Virtual classes hang from session-formations (several may share one) and carry their own organization. */
final class Version20261127260000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE virtual_class ADD organization_id INT DEFAULT NULL');
        $this->addSql('UPDATE virtual_class c SET organization_id = f.organization_id FROM formation f WHERE f.id = c.formation_id');
        $this->addSql('ALTER TABLE virtual_class ALTER organization_id SET NOT NULL');
        $this->addSql('ALTER TABLE virtual_class ADD CONSTRAINT FK_C5A0291C32C8A3DE FOREIGN KEY (organization_id) REFERENCES organization (id) NOT DEFERRABLE');
        $this->addSql('CREATE INDEX IDX_C5A0291C32C8A3DE ON virtual_class (organization_id)');
        $this->addSql('CREATE TABLE virtual_class_session_formation (virtual_class_id INT NOT NULL, session_formation_id INT NOT NULL, PRIMARY KEY (virtual_class_id, session_formation_id))');
        $this->addSql('CREATE INDEX IDX_4E71E2A4E1EDA3E2 ON virtual_class_session_formation (virtual_class_id)');
        $this->addSql('CREATE INDEX IDX_4E71E2A49C9D95AF ON virtual_class_session_formation (session_formation_id)');
        $this->addSql('ALTER TABLE virtual_class_session_formation ADD CONSTRAINT FK_4E71E2A4E1EDA3E2 FOREIGN KEY (virtual_class_id) REFERENCES virtual_class (id) ON DELETE CASCADE NOT DEFERRABLE');
        $this->addSql('ALTER TABLE virtual_class_session_formation ADD CONSTRAINT FK_4E71E2A49C9D95AF FOREIGN KEY (session_formation_id) REFERENCES session_formation (id) ON DELETE CASCADE NOT DEFERRABLE');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE virtual_class_session_formation');
        $this->addSql('ALTER TABLE virtual_class DROP organization_id');
    }
}
