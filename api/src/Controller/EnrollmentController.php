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
    #[IsGranted('ROLE_LECTURE')]
    public function list(VirtualClass $class): JsonResponse
    {
        $items = $this->em->getRepository(Enrollment::class)->findBy(['virtualClass' => $class], ['createdAt' => 'ASC']);

        return $this->json([
            'capacity' => $class->capacity,
            'enrollments' => array_map(fn (Enrollment $e) => $this->serialize($e), $items),
        ]);
    }

    #[Route('/virtual-classes/{id}/enrollments', methods: 'POST')]
    #[IsGranted('ROLE_SUIVI')]
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
    #[IsGranted('ROLE_SUIVI')]
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
