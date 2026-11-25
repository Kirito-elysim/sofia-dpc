<?php

namespace App\Controller;

use App\Dto\EnrollmentInput;
use App\Entity\Enrollment;
use App\Entity\Participant;
use App\Entity\VirtualClass;
use App\Service\EnrollmentException;
use App\Service\EnrollmentService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api')]
class EnrollmentController extends AbstractController
{
    public function __construct(private EnrollmentService $enrollments, private EntityManagerInterface $em)
    {
    }

    #[Route('/virtual-classes/{id}/enrollments', methods: 'GET')]
    #[IsGranted('SOFIA_CLASSES')]
    public function list(VirtualClass $class): JsonResponse
    {
        $items = $this->em->getRepository(Enrollment::class)->findBy(['virtualClass' => $class], ['createdAt' => 'ASC']);

        return $this->json([
            'zoomRegistrations' => $this->em->getConnection()->fetchAllAssociative("SELECT e.id AS enrollment,s.id AS slot,ts.label,
                coalesce(z.state,'queued') AS state, CASE WHEN z.state='approved' THEN z.join_url END AS url
                FROM enrollment e JOIN class_slot s ON s.virtual_class_id=e.virtual_class_id JOIN time_slot ts ON ts.id=s.time_slot_id
                LEFT JOIN zoom_registration z ON z.slot_id=s.id AND z.enrollment_id=e.id
                WHERE e.virtual_class_id=? AND e.status='ACTIVE' ORDER BY ts.start_time,s.id",[$class->getId()]),
            'capacity' => $class->capacity,
            'teachingSlots' => array_map(static function (array $slot): array {
                $slot['policy'] = $slot['policy'] === null ? null : json_decode($slot['policy'],true,512,JSON_THROW_ON_ERROR);
                return $slot;
            }, $this->em->getConnection()->fetchAllAssociative(
                "SELECT s.id, s.zoom_policy AS policy, s.zoom_state AS state, ts.label, ts.start_time AS start, ts.end_time AS end_time,
                        NULLIF(concat_ws(' ', t.civility, t.first_name, t.last_name), '') AS trainer
                 FROM class_slot s JOIN time_slot ts ON ts.id = s.time_slot_id
                 LEFT JOIN trainer t ON t.id = s.trainer_id
                 WHERE s.virtual_class_id = ? ORDER BY ts.start_time, s.id", [$class->getId()]
            )),
            'enrollments' => array_map(fn (Enrollment $e) => $this->serialize($e), $items),
        ]);
    }

    #[Route('/virtual-classes/{id}/enrollments', methods: 'POST')]
    #[IsGranted('SOFIA_ENROLL')]
    public function create(VirtualClass $class, #[MapRequestPayload] EnrollmentInput $in): JsonResponse
    {
        try {
            $e = $this->enrollments->enroll($class, new Participant($in->firstName, $in->lastName, $in->email, $in->phone, $in->rpps));
        } catch (EnrollmentException $ex) {
            return $this->problem($ex->errorCode, $ex->getMessage(), $ex->status);
        }

        return $this->json($this->serialize($e), Response::HTTP_CREATED);
    }

    #[Route('/enrollments/{id}', methods: 'DELETE')]
    #[IsGranted('SOFIA_ENROLL')]
    public function cancel(Enrollment $enrollment): Response
    {
        $this->enrollments->cancel($enrollment);

        return new Response(null, Response::HTTP_NO_CONTENT);
    }

    /** RFC 7807 with a stable business code. */
    private function problem(string $code, string $detail, int $status): JsonResponse
    {
        return new JsonResponse(['type' => 'about:blank', 'title' => $code, 'code' => $code, 'detail' => $detail, 'status' => $status], $status, ['Content-Type' => 'application/problem+json']);
    }

    /** @return array<string, mixed> */
    private function serialize(Enrollment $e): array
    {
        $ps = $e->participant;

        return [
            'id' => $e->getId(),
            'status' => $e->status->value,
            'createdAt' => $e->createdAt->format(DATE_ATOM),
            'participant' => ['id' => $ps->getId(), 'firstName' => $ps->firstName, 'lastName' => $ps->lastName, 'email' => $ps->email, 'phone' => $ps->phone, 'rpps' => $ps->rpps],
        ];
    }
}
