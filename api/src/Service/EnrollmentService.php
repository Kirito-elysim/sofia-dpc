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
            // Lock the class row so two concurrent enrollments cannot both take the last seat.
            $this->em->lock($class, \Doctrine\DBAL\LockMode::PESSIMISTIC_WRITE);

            if (ClassStatus::PLANNED !== $class->status) {
                throw new EnrollmentException('CLASS_NOT_OPEN', 'Les inscriptions ne sont plus ouvertes pour cette classe.', 409);
            }

            $email = mb_strtolower(trim($input->email));
            $ps = $this->em->getRepository(Participant::class)->findOneBy(['email' => $email]);
            if (null === $ps) {
                $input->email = $email;
                $ps = $input;
                $this->em->persist($ps);
            }

            $existing = $this->em->getRepository(Enrollment::class)->findOneBy(['virtualClass' => $class, 'participant' => $ps]);
            if ($existing && EnrollmentStatus::ACTIVE === $existing->status) {
                throw new EnrollmentException('ALREADY_ENROLLED', 'Ce participant est déjà inscrit à cette classe.', 409);
            }

            $active = (int) $this->em->createQuery(
                'SELECT COUNT(e) FROM App\Entity\Enrollment e WHERE e.virtualClass = :c AND e.status = :s'
            )->setParameters(['c' => $class, 's' => EnrollmentStatus::ACTIVE])->getSingleScalarResult();
            if ($active >= $class->capacity) {
                throw new EnrollmentException('CAPACITY_REACHED', 'La capacité maximale de la classe est atteinte.', 409);
            }

            $enrollment = $existing ?? new Enrollment($class, $ps);
            $enrollment->status = EnrollmentStatus::ACTIVE; // re-enrolling a cancelled PS reuses the row
            $this->em->persist($enrollment);
            $this->em->flush();


            $conn->commit();
        } catch (\Throwable $e) {
            $conn->rollBack();
            throw $e;
        }

        // After commit, so the worker always finds the row.
        $this->bus->dispatch(new SendEnrollmentConfirmation($enrollment->getId(), $this->security->getUser()?->getUserIdentifier()));

        return $enrollment;
    }

    public function cancel(Enrollment $enrollment): void
    {
        $enrollment->status = EnrollmentStatus::CANCELLED;
        $this->em->flush();
    }
}
