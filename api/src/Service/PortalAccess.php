<?php

namespace App\Service;

use Doctrine\DBAL\Connection;

/**
 * What a PS may reach. Plain SQL on purpose: the portal is anonymous for Symfony and must not depend on
 * the staff organization filter of whoever else is signed in on the same browser.
 */
class PortalAccess
{
    private const REGISTRATIONS = <<<'SQL'
        SELECT r.id, sf.id AS session_formation_id, sf.formation_id, se.name AS session, f.title AS formation, o.name AS organization, o.email_from,
               coalesce(r.access_starts_on, sf.access_starts_on, se.starts_on) AS starts_on,
               coalesce(r.access_ends_on, sf.access_ends_on, se.ends_on) AS ends_on
        FROM registration r
        JOIN participant p ON p.id = r.participant_id AND p.deleted_at IS NULL
        JOIN session_formation sf ON sf.id = r.session_formation_id AND sf.deleted_at IS NULL
        JOIN session se ON se.id = sf.session_id AND se.deleted_at IS NULL
        JOIN organization o ON o.id = se.organization_id AND o.deleted_at IS NULL
        JOIN formation f ON f.id = sf.formation_id AND f.deleted_at IS NULL
        WHERE r.participant_id = ? AND r.deleted_at IS NULL
        ORDER BY 8, r.id
        SQL;

    public function __construct(private Connection $db)
    {
    }

    public static function today(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('Europe/Paris')))->format('Y-m-d');
    }

    /** @return list<array<string, mixed>> every registration, with « open » while today is within its access dates */
    public function registrations(int $participant): array
    {
        $today = self::today();

        return array_map(static fn (array $r): array => $r + ['open' => $r['starts_on'] <= $today && $today <= $r['ends_on']],
            $this->db->fetchAllAssociative(self::REGISTRATIONS, [$participant]));
    }

    /**
     * The organization writing to the PS: that of the first access still running or to come.
     *
     * @return array{name: string, email_from: string}|null null: nothing left to sign in for
     */
    public function sender(int $participant): ?array
    {
        foreach ($this->registrations($participant) as $r) {
            if ($r['ends_on'] >= self::today()) {
                return ['name' => (string) $r['organization'], 'email_from' => (string) $r['email_from']];
            }
        }

        return null;
    }

    /** @return list<array<string, mixed>> */
    public function resources(int $formation, int $sessionFormation): array
    {
        return $this->db->fetchAllAssociative('SELECT id, title, url, file_name AS "fileName" FROM learning_resource
            WHERE deleted_at IS NULL AND (formation_id = ? OR session_formation_id = ?) ORDER BY id', [$formation, $sessionFormation]);
    }

    /** @return array<string, mixed>|null the file, if an open registration of this PS gives it */
    public function file(int $participant, int $resource): ?array
    {
        foreach ($this->registrations($participant) as $r) {
            if (!$r['open']) {
                continue;
            }
            $row = $this->db->fetchAssociative('SELECT file_name, mime, content FROM learning_resource
                WHERE id = ? AND deleted_at IS NULL AND content IS NOT NULL AND (formation_id = ? OR session_formation_id = ?)', [$resource, $r['formation_id'], $r['session_formation_id']]);
            if ($row) {
                return $row;
            }
        }

        return null;
    }

    /** @return list<array<string, mixed>> half-days of the session-formation, with the personal Zoom link once approved */
    public function classes(int $participant, int $sessionFormation): array
    {
        return $this->db->fetchAllAssociative("SELECT c.id AS \"classId\", c.date, ts.label, ts.start_time AS start, ts.end_time AS \"end\",
                CASE WHEN z.state = 'approved' AND e.id IS NOT NULL AND c.status IN ('PLANNED', 'IN_PROGRESS') THEN z.join_url END AS \"joinUrl\"
            FROM virtual_class_session_formation link
            JOIN virtual_class c ON c.id = link.virtual_class_id AND c.deleted_at IS NULL AND c.status <> 'CANCELLED'
            JOIN class_slot s ON s.virtual_class_id = c.id AND s.deleted_at IS NULL
            JOIN time_slot ts ON ts.id = s.time_slot_id
            LEFT JOIN enrollment e ON e.virtual_class_id = c.id AND e.participant_id = ? AND e.status = 'ACTIVE'
            LEFT JOIN zoom_registration z ON z.slot_id = s.id AND z.enrollment_id = e.id
            WHERE link.session_formation_id = ? ORDER BY c.date, ts.start_time, s.id", [$participant, $sessionFormation]);
    }
}
