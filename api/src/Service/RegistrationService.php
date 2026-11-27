<?php

namespace App\Service;

use App\Dto\RegistrationInput;
use App\Entity\Enrollment;
use App\Entity\Participant;
use App\Entity\Registration;
use App\Entity\SessionFormation;
use App\Entity\VirtualClass;
use App\Enum\ClassStatus;
use App\Enum\EnrollmentStatus;
use Doctrine\DBAL\LockMode;
use Doctrine\ORM\EntityManagerInterface;

class RegistrationService
{
    public function __construct(private EntityManagerInterface $em, private EnrollmentService $enrollments)
    {
    }

    /** @throws EnrollmentException with a stable business code */
    public function register(SessionFormation $sessionFormation, RegistrationInput $in): Registration
    {
        $conn = $this->em->getConnection();
        $conn->beginTransaction();
        try {
            // Lock the row so two concurrent registrations cannot both take the last seat.
            $this->em->lock($sessionFormation, LockMode::PESSIMISTIC_WRITE);
            $participant = $this->enrollments->participant(new Participant($in->firstName, $in->lastName, $in->email, $in->phone, $in->rpps));
            $repository = $this->em->getRepository(Registration::class);
            $registration = $participant->getId() ? $repository->findOneBy(['sessionFormation' => $sessionFormation, 'participant' => $participant]) : null;
            if ($registration && null === $registration->getDeletedAt()) {
                throw new EnrollmentException('ALREADY_REGISTERED', 'Ce participant est déjà inscrit à cette formation.', 409);
            }
            if ($sessionFormation->getRegisteredCount() >= $sessionFormation->capacity) {
                throw new EnrollmentException('CAPACITY_REACHED', 'La capacité de la formation dans cette session est atteinte.', 409);
            }
            $registration ??= new Registration($sessionFormation, $participant);
            $registration->restore();
            $this->apply($registration, $in->funding, $in->accessStartsOn, $in->accessEndsOn);
            $this->em->persist($registration);
            $this->em->flush();
            $created = [];
            foreach ($sessionFormation->plannedClasses() as $class) {
                // Classes already held or cancelled are not joined afterwards.
                if (ClassStatus::PLANNED === $class->status) {
                    $created[] = $this->enrollments->place($class, $participant);
                }
            }
            $conn->commit();
        } catch (\Throwable $e) {
            $conn->rollBack();
            throw $e;
        }
        $this->enrollments->confirm(array_filter($created));

        return $registration;
    }

    public function update(Registration $registration, ?string $funding, ?string $startsOn, ?string $endsOn): void
    {
        $this->apply($registration, $funding, $startsOn, $endsOn);
        $this->em->flush();
    }

    public function cancel(Registration $registration): void
    {
        $this->em->wrapInTransaction(function () use ($registration): void {
            $registration->markDeleted();
            $this->em->flush();
            foreach ($registration->sessionFormation->plannedClasses() as $class) {
                // Held classes keep their presence history; a shared class stays open through another registration.
                if (ClassStatus::PLANNED !== $class->status || $this->stillServed($class, $registration->participant)) {
                    continue;
                }
                $enrollment = $this->em->getRepository(Enrollment::class)->findOneBy(['virtualClass' => $class, 'participant' => $registration->participant]);
                if ($enrollment && EnrollmentStatus::ACTIVE === $enrollment->status) {
                    $this->enrollments->cancel($enrollment);
                }
            }
        });
    }

    /**
     * A new class takes in everyone already registered to what it serves. Call it inside the scheduling transaction.
     *
     * @param list<SessionFormation> $served
     *
     * @return list<Enrollment> to confirm once committed
     */
    public function placeRegistered(VirtualClass $class, array $served): array
    {
        $created = [];
        foreach ($served as $sessionFormation) {
            foreach ($sessionFormation->activeRegistrations() as $registration) {
                $created[] = $this->enrollments->place($class, $registration->participant);
            }
        }

        return array_values(array_filter($created));
    }

    private function stillServed(VirtualClass $class, Participant $participant): bool
    {
        foreach ($class->sessionFormations() as $sessionFormation) {
            foreach ($sessionFormation->activeRegistrations() as $registration) {
                if ($registration->participant === $participant) {
                    return true;
                }
            }
        }

        return false;
    }

    private function apply(Registration $registration, ?string $funding, ?string $startsOn, ?string $endsOn): void
    {
        $offered = $registration->sessionFormation->formation->fundingTypes;
        if (null !== $funding && !in_array($funding, $offered, true)) {
            throw new EnrollmentException('FUNDING_NOT_OFFERED', 'Ce financement n’est pas proposé par la formation.', 422);
        }
        $registration->funding = $funding;
        $registration->accessStartsOn = $startsOn ? new \DateTimeImmutable($startsOn) : null;
        $registration->accessEndsOn = $endsOn ? new \DateTimeImmutable($endsOn) : null;
        if ($registration->getEffectiveAccessEndsOn()->format('Y-m-d') < $registration->getEffectiveAccessStartsOn()->format('Y-m-d')) {
            throw new EnrollmentException('INVALID_ACCESS_DATES', 'La fin d’accès précède le début.', 422);
        }
    }
}
