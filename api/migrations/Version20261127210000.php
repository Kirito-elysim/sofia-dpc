<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;
use Symfony\Component\String\Slugger\AsciiSlugger;

/** The typed reference becomes the formation « acronyme »; the reference is now generated and stored. */
final class Version20261127210000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE formation RENAME COLUMN custom_reference TO acronym');
        $this->addSql('ALTER TABLE formation ALTER reference TYPE VARCHAR(300)');
    }

    /** Fills the reference of existing formations, as Formation::refreshReference() does. */
    public function postUp(Schema $schema): void
    {
        $slugger = new AsciiSlugger('fr');
        $rows = $this->connection->fetchAllAssociative('SELECT f.id, f.title, f.acronym, COALESCE(a.acronym, \'\') AS prefix, COALESCE(a.name, f.audience, \'\') AS audience
            FROM formation f LEFT JOIN target_audience a ON a.id = f.target_audience_id');
        foreach ($rows as $row) {
            $prefix = $slugger->slug($row['prefix'])->upper()->toString();
            if ('' === $prefix && preg_match('/\p{L}/u', $row['audience'], $initial)) {
                $prefix = mb_strtoupper($initial[0]);
            }
            $own = $slugger->slug($row['acronym'] ?? '')->upper()->toString() ?: $slugger->slug($row['title'])->lower()->toString();
            if ('' !== $prefix && '' !== $own) {
                $this->connection->update('formation', ['reference' => mb_substr($prefix.'-'.$own, 0, 300)], ['id' => $row['id']]);
            }
        }
    }

    public function down(Schema $schema): void
    {
        // Generated references longer than the former limit are shortened.
        $this->addSql('ALTER TABLE formation ALTER reference TYPE VARCHAR(50) USING left(reference, 50)');
        $this->addSql('ALTER TABLE formation RENAME COLUMN acronym TO custom_reference');
    }
}
