<?php

namespace App\Controller;

use App\Entity\AuditLog;
use App\Entity\Trainer;
use App\Security\OrganizationScope;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{File\UploadedFile, HeaderUtils, JsonResponse, Request, Response};
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/** CV and contract of a trainer: personal documents, reserved to those who manage the sheet. */
#[Route('/api/trainers/{id<\d+>}/documents')]
#[IsGranted('SOFIA_EDIT_TRAINERS')]
final class TrainerDocumentController extends AbstractController
{
    private const KIND = ['kind' => 'cv|contract'];
    private const MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

    public function __construct(private EntityManagerInterface $em, private OrganizationScope $scope)
    {
    }

    #[Route('', methods: 'GET')]
    public function list(int $id): JsonResponse
    {
        $this->check($id);

        return $this->json($this->em->getConnection()->fetchAllAssociative(
            'SELECT kind, name FROM trainer_document WHERE trainer_id = ? AND deleted_at IS NULL ORDER BY kind', [$id]));
    }

    #[Route('/{kind}', requirements: self::KIND, methods: 'GET')]
    public function download(int $id, string $kind): Response
    {
        $this->check($id);
        $row = $this->em->getConnection()->fetchAssociative(
            'SELECT name, mime, content FROM trainer_document WHERE trainer_id = ? AND kind = ? AND deleted_at IS NULL', [$id, $kind])
            ?: throw $this->createNotFoundException();
        $name = str_replace(['/', '\\', '%'], '-', $row['name']);

        return new Response((string) base64_decode($row['content'], true), 200, [
            'Content-Type' => $row['mime'],
            'Content-Disposition' => HeaderUtils::makeDisposition('attachment', $name, preg_replace('/[^\x20-\x7e]/', '_', $name) ?? 'document'),
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    #[Route('/{kind}', requirements: self::KIND, methods: 'POST')]
    public function upload(int $id, string $kind, Request $request): Response
    {
        $this->check($id);
        $file = $request->files->get('file');
        if (!$file instanceof UploadedFile || !$file->isValid() || !$file->getSize() || $file->getSize() > 5 * 1024 * 1024
            || !in_array($file->getMimeType(), self::MIMES, true)) {
            throw new UnprocessableEntityHttpException('Choisissez un fichier PDF, JPG ou PNG de 5 Mo maximum.');
        }
        $this->em->getConnection()->executeStatement(
            'INSERT INTO trainer_document (trainer_id, kind, name, mime, content) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (trainer_id, kind) DO UPDATE SET name = EXCLUDED.name, mime = EXCLUDED.mime, content = EXCLUDED.content, deleted_at = NULL',
            [$id, $kind, mb_substr($file->getClientOriginalName(), 0, 255), $file->getMimeType(), base64_encode($file->getContent())]);

        return $this->audit('TRAINER_DOCUMENT_SAVED', $id, $kind);
    }

    #[Route('/{kind}', requirements: self::KIND, methods: 'DELETE')]
    public function remove(int $id, string $kind): Response
    {
        $this->check($id);
        $this->em->getConnection()->executeStatement(
            'UPDATE trainer_document SET deleted_at = CURRENT_TIMESTAMP WHERE trainer_id = ? AND kind = ? AND deleted_at IS NULL', [$id, $kind]);

        return $this->audit('TRAINER_DOCUMENT_DELETED', $id, $kind);
    }

    private function check(int $id): void
    {
        $trainer = $this->em->getRepository(Trainer::class)->findOneBy(['id' => $id]);
        if (!$trainer || $trainer->getDeletedAt()) {
            throw $this->createNotFoundException('Formateur introuvable.');
        }
        $this->scope->requireTrainer($trainer);
    }

    private function audit(string $action, int $id, string $kind): Response
    {
        $this->em->persist(new AuditLog($this->getUser()?->getUserIdentifier(), $action, 'Trainer', $id, ['kind' => $kind]));
        $this->em->flush();

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}
