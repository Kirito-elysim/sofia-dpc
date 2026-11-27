<?php

namespace App\Service;

use App\Entity\Enrollment;
use App\Entity\Participant;
use App\Entity\VirtualClass;
use App\Enum\ClassStatus;
use App\Enum\EnrollmentStatus;
use App\Message\SendEnrollmentConfirmation;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\Messenger\MessageBusInterface;

class EnrollmentService
{
    public function __construct(
        private EntityManagerInterface $em,
        private MessageBusInterface $bus,
        private Security $security,
    ) {
    }

    /** @throws EnrollmentException with a stable business code */
    public function enroll(VirtualClass $class, Participant $input): Enrollment
    {
        $conn = $this->em->getConnection();
        $conn->beginTransaction(); // not wrapInTransaction(): it would close the EntityManager on a business error
        try {
            $ps = $this->participant($input);
            $enrollment = $this->place($class, $ps) ?? throw new EnrollmentException('ALREADY_ENROLLED', 'Ce participant est déjà inscrit à cette classe.', 409);
            $conn->commit();
        } catch (\Throwable $e) {
            $conn->rollBack();
            throw $e;
        }
        $this->confirm([$enrollment]);

        return $enrollment;
    }

    /** The known participant with this e-mail, or the given one, persisted. */
    public function participant(Participant $input): Participant
    {
        $email = mb_strtolower(trim($input->email));
        // Participant identity is shared across organizations. Only enrollments are scoped here.
        $filters = $this->em->getFilters();
        $scoped = $filters->isEnabled('organization_scope');
        if ($scoped) {
            $filters->suspend('organization_scope');
        }
        try {
            $ps = $this->em->getRepository(Participant::class)->findOneBy(['email' => $email]);
        } finally {
            if ($scoped) {
                $filters->restore('organization_scope');
            }
        }
        if (null === $ps) {
            $input->email = $email;
            $ps = $input;
            $this->em->persist($ps);
        }

        return $ps;
    }

    /**
     * Gives the participant a seat in the class, inside the caller's transaction.
     *
     * @return Enrollment|null null: they already have one
     *
     * @throws EnrollmentException
     */
    public function place(VirtualClass $class, Participant $ps): ?Enrollment
    {
        $this->em->flush();
        // Lock the class row so two concurrent enrollments cannot both take the last seat.
        $this->em->lock($class, \Doctrine\DBAL\LockMode::PESSIMISTIC_WRITE);
        if (ClassStatus::PLANNED !== $class->status) {
            throw new EnrollmentException('CLASS_NOT_OPEN', 'Les inscriptions ne sont plus ouvertes pour cette classe.', 409);
        }
        $conn = $this->em->getConnection();
        $email = mb_strtolower(trim($ps->email));
        $teachesHere = $conn->fetchOne(
            'SELECT 1 FROM class_slot s JOIN trainer t ON t.id = s.trainer_id
             LEFT JOIN "user" u ON u.trainer_id = t.id
             WHERE s.virtual_class_id = ? AND (LOWER(TRIM(t.email)) = ? OR LOWER(TRIM(u.email)) = ?) LIMIT 1',
            [$class->getId(), $email, $email],
        );
        if (false !== $teachesHere) {
            throw new EnrollmentException('TRAINER_ASSIGNED_TO_CLASS', 'Cette personne anime un créneau de cette classe et ne peut pas y être inscrite comme apprenant.', 409);
        }
        $existing = $this->em->getRepository(Enrollment::class)->findOneBy(['virtualClass' => $class, 'participant' => $ps]);
        if ($existing && EnrollmentStatus::ACTIVE === $existing->status) {
            return null;
        }
        $active = (int) $this->em->createQuery(
            'SELECT COUNT(e) FROM App\Entity\Enrollment e WHERE e.virtualClass = :c AND e.status = :s'
        )->setParameters(['c' => $class, 's' => EnrollmentStatus::ACTIVE])->getSingleScalarResult();
        if ($active >= $class->capacity) {
            throw new EnrollmentException('CAPACITY_REACHED', 'La capacité maximale de la classe du '.$class->date->format('d/m/Y').' est atteinte.', 409);
        }
        if ($existing) {
            $conn->executeStatement("UPDATE zoom_registration SET state='queued',registrant_id=NULL,join_url=NULL
                WHERE enrollment_id=? AND state IN ('revoked','cancelled','denied')", [$existing->getId()]);
        }
        $enrollment = $existing ?? new Enrollment($class, $ps);
        $enrollment->status = EnrollmentStatus::ACTIVE; // re-enrolling a cancelled PS reuses the row
        $enrollment->restore();
        $this->em->persist($enrollment);
        $this->em->flush();

        return $enrollment;
    }

    /**
     * Queues the confirmation mails. Call it after commit, so the worker always finds the rows.
     *
     * @param array<Enrollment> $enrollments
     */
    public function confirm(array $enrollments): void
    {
        foreach ($enrollments as $enrollment) {
            $this->bus->dispatch(new SendEnrollmentConfirmation((int) $enrollment->getId(), $this->security->getUser()?->getUserIdentifier()));
        }
    }

    public function cancel(Enrollment $enrollment): void
    {
        $enrollment->status = EnrollmentStatus::CANCELLED;
        $enrollment->markDeleted();
        $this->em->flush();
    }
}
