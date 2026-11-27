<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** A formation is active when it is published: the separate flag disappears. */
final class Version20261127230000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE formation DROP active');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE formation ADD active BOOLEAN DEFAULT true NOT NULL');
        $this->addSql("UPDATE formation SET active = (publication_status = 'published')");
    }
}
