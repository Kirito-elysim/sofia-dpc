<?php
namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261124190000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql("ALTER TABLE message_template ADD minutes_before INTEGER CHECK (minutes_before BETWEEN 0 AND 525600), ADD presence_rule VARCHAR(16) DEFAULT 'ALL' NOT NULL");
        $this->addSql('CREATE TABLE reminder_delivery (template_id INT REFERENCES message_template(id), slot_id INT REFERENCES class_slot(id), enrollment_id INT REFERENCES enrollment(id), message_log_id INT REFERENCES message_log(id), PRIMARY KEY(template_id,slot_id,enrollment_id))');
        $this->addSql('CREATE INDEX attendance_slot_connection ON attendance_event(slot_id,connection_key,at DESC,id DESC)');
    }
    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX attendance_slot_connection');
        $this->addSql('DROP TABLE reminder_delivery');
        $this->addSql('ALTER TABLE message_template DROP minutes_before, DROP presence_rule');
    }
}
