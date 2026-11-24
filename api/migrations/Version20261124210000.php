<?php
namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261124210000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE zoom_registration (slot_id INT REFERENCES class_slot(id) ON DELETE CASCADE, enrollment_id INT REFERENCES enrollment(id) ON DELETE CASCADE, state VARCHAR(20) NOT NULL, registrant_id TEXT, join_url TEXT, event_ts BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(slot_id,enrollment_id), UNIQUE(slot_id,registrant_id), UNIQUE(join_url))');
    }
    public function down(Schema $schema): void { $this->addSql('DROP TABLE zoom_registration'); }
}
