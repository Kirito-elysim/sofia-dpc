<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** « Training » becomes « Formation » : renames only, no row is lost. */
final class Version20261127190000 extends AbstractMigration
{
    private const TABLES = [
        'training' => 'formation',
        'trainer_training' => 'trainer_formation',
        'training_additional_organization' => 'formation_additional_organization',
    ];

    private const COLUMNS = ['virtual_class', 'trainer_formation', 'formation_additional_organization'];

    private const INDEXES = [
        'training_pkey' => 'formation_pkey',
        'idx_c5a0291cbefd98d1' => 'idx_c5a0291c5200282e',
        'idx_d5128a8f32c8a3de' => 'idx_404021bf32c8a3de',
        'training_target_audience_idx' => 'idx_404021bf3b6891c',
        'training_additional_org_idx' => 'idx_5ee9bb3a32c8a3de',
        'trainer_training_pkey' => 'trainer_formation_pkey',
        'training_additional_organization_pkey' => 'formation_additional_organization_pkey',
    ];

    public function up(Schema $schema): void
    {
        foreach (self::TABLES as $old => $new) {
            $this->addSql("ALTER TABLE $old RENAME TO $new");
        }
        foreach (self::COLUMNS as $table) {
            $this->addSql("ALTER TABLE $table RENAME COLUMN training_id TO formation_id");
        }
        foreach (self::INDEXES as $old => $new) {
            $this->addSql("ALTER INDEX $old RENAME TO $new");
        }
        $this->addSql("UPDATE custom_role SET permissions = replace(permissions::text, 'TRAININGS', 'FORMATIONS')::json");
    }

    public function down(Schema $schema): void
    {
        $this->addSql("UPDATE custom_role SET permissions = replace(permissions::text, 'FORMATIONS', 'TRAININGS')::json");
        foreach (self::INDEXES as $old => $new) {
            $this->addSql("ALTER INDEX $new RENAME TO $old");
        }
        foreach (self::COLUMNS as $table) {
            $this->addSql("ALTER TABLE $table RENAME COLUMN formation_id TO training_id");
        }
        foreach (self::TABLES as $old => $new) {
            $this->addSql("ALTER TABLE $new RENAME TO $old");
        }
    }
}
