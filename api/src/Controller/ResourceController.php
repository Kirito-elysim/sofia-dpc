<?php

namespace App\Controller;

use App\Entity\Formation;
use App\Entity\LearningResource;
use App\Entity\SessionFormation;
use App\Security\OrganizationScope;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{File\UploadedFile, HeaderUtils, JsonResponse, Request, Response};
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Symfony\Component\Routing\Attribute\Route;

/** Resources managed by the team. Learners reach theirs through the portal. */
#[Route('/api')]
final class ResourceController extends AbstractController
{
    private const MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
    private const MAX_BYTES = 5 * 1024 * 1024; // docker/uploads.ini

    public function __construct(private EntityManagerInterface $em, private OrganizationScope $scope)
    {
    }

    #[Route('/formations/{id<\d+>}/resources', methods: 'GET')]
    public function ofFormation(Formation $formation): JsonResponse
    {
        $this->guard($formation, false);

        return $this->listing(['formation' => $formation]);
    }

    #[Route('/formations/{id<\d+>}/resources', methods: 'POST')]
    public function addToFormation(Formation $formation, Request $request): JsonResponse
    {
        $this->guard($formation, true);
        $resource = $this->read($request);
        $resource->formation = $formation;

        return $this->save($resource);
    }

    #[Route('/session-formations/{id<\d+>}/resources', methods: 'GET')]
    public function ofSession(SessionFormation $sessionFormation): JsonResponse
    {
        $this->guard($sessionFormation, false);

        return $this->listing(['sessionFormation' => $sessionFormation]);
    }

    #[Route('/session-formations/{id<\d+>}/resources', methods: 'POST')]
    public function addToSession(SessionFormation $sessionFormation, Request $request): JsonResponse
    {
        $this->guard($sessionFormation, true);
        $resource = $this->read($request);
        $resource->sessionFormation = $sessionFormation;

        return $this->save($resource);
    }

    #[Route('/resources/{id<\d+>}/file', methods: 'GET')]
    public function resourceFile(LearningResource $resource): Response
    {
        $this->guard($this->owner($resource), false);

        return self::download($resource->fileName, $resource->mime, $resource->content);
    }

    #[Route('/resources/{id<\d+>}', methods: 'DELETE')]
    public function remove(LearningResource $resource): Response
    {
        $this->guard($this->owner($resource), true);
        $resource->markDeleted();
        $this->em->flush();

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    public static function download(?string $fileName, ?string $mime, ?string $content): Response
    {
        if (null === $content) {
            throw new \Symfony\Component\HttpKernel\Exception\NotFoundHttpException('Fichier introuvable.');
        }
        $name = str_replace(['/', '\\', '%'], '-', $fileName ?? 'document');

        return new Response((string) base64_decode($content, true), 200, [
            'Content-Type' => $mime ?? 'application/octet-stream',
            'Content-Disposition' => HeaderUtils::makeDisposition('attachment', $name, preg_replace('/[^\x20-\x7e]/', '_', $name) ?? 'document'),
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function owner(LearningResource $resource): Formation|SessionFormation
    {
        $owner = $resource->getDeletedAt() ? null : ($resource->formation ?? $resource->sessionFormation);

        return $owner ?? throw $this->createNotFoundException();
    }

    private function guard(Formation|SessionFormation $owner, bool $write): void
    {
        $formation = $owner instanceof Formation;
        $this->denyAccessUnlessGranted($formation ? ($write ? 'SOFIA_EDIT_FORMATIONS' : 'SOFIA_FORMATIONS') : ($write ? 'SOFIA_SCHEDULE' : 'SOFIA_CLASSES'));
        if ($owner->getDeletedAt()) {
            throw $this->createNotFoundException();
        }
        $this->scope->require($owner instanceof Formation ? $owner->organization->getId() : $owner->session->organization->getId());
    }

    private function read(Request $request): LearningResource
    {
        $title = trim($request->request->getString('title'));
        $url = trim($request->request->getString('url'));
        $file = $request->files->get('file');
        if ('' === $title || mb_strlen($title) > 150) {
            throw new UnprocessableEntityHttpException('Donnez un titre de 150 caractères maximum.');
        }
        if (('' !== $url) === ($file instanceof UploadedFile)) {
            throw new UnprocessableEntityHttpException('Joignez soit un fichier, soit un lien.');
        }
        $resource = new LearningResource($title);
        if ('' !== $url) {
            if (strlen($url) > 500 || !str_starts_with($url, 'https://') || !filter_var($url, FILTER_VALIDATE_URL)) {
                throw new UnprocessableEntityHttpException('Le lien doit commencer par https://.');
            }
            $resource->url = $url;

            return $resource;
        }
        if (!$file->isValid() || !$file->getSize() || $file->getSize() > self::MAX_BYTES || !in_array($file->getMimeType(), self::MIMES, true)) {
            throw new UnprocessableEntityHttpException('Choisissez un fichier PDF, JPG ou PNG de 5 Mo maximum.');
        }
        $resource->fileName = mb_substr($file->getClientOriginalName(), 0, 255);
        $resource->mime = $file->getMimeType();
        $resource->content = base64_encode($file->getContent());

        return $resource;
    }

    private function save(LearningResource $resource): JsonResponse
    {
        $this->em->persist($resource);
        $this->em->flush();

        return $this->json($this->serialize($resource), Response::HTTP_CREATED);
    }

    /** @param array<string, object> $owner */
    private function listing(array $owner): JsonResponse
    {
        $items = $this->em->getRepository(LearningResource::class)->findBy($owner + ['deletedAt' => null], ['id' => 'ASC']);

        return $this->json(array_map($this->serialize(...), $items));
    }

    /** @return array<string, mixed> */
    private function serialize(LearningResource $r): array
    {
        return ['id' => $r->getId(), 'title' => $r->title, 'url' => $r->url, 'fileName' => $r->fileName];
    }
}
