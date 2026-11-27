<?php

namespace App\Controller;

use App\Entity\AuditLog;
use App\Entity\Participant;
use App\Message\SendPortalLink;
use App\Service\PortalAccess;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{JsonResponse, Request, Response};
use Symfony\Component\HttpKernel\Exception\{TooManyRequestsHttpException, UnauthorizedHttpException, UnprocessableEntityHttpException};
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Learner portal. Public for the firewall: a PS is not a user of the application. Signing in only stores
 * their id in the session, which opens these routes and nothing else.
 */
#[Route('/api/portal')]
final class PortalController extends AbstractController
{
    private const SESSION_KEY = 'portal_participant';

    public function __construct(private Connection $db, private EntityManagerInterface $em, private PortalAccess $access)
    {
    }

    /** Always answers the same way, so nobody can test whether an address is registered. */
    #[Route('/links', methods: 'POST')]
    public function request(Request $request, MessageBusInterface $bus, RateLimiterFactoryInterface $portalIpLimiter, RateLimiterFactoryInterface $portalEmailLimiter): Response
    {
        $email = $this->field($request, 'email');
        $email = mb_strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 180) {
            throw new UnprocessableEntityHttpException('Saisissez une adresse e-mail valide.');
        }
        if (!$portalIpLimiter->create($request->getClientIp() ?? '')->consume()->isAccepted()) {
            throw new TooManyRequestsHttpException(null, 'Trop de demandes. Réessayez dans quelques minutes.');
        }
        $id = $this->db->fetchOne('SELECT id FROM participant WHERE lower(email) = ? AND deleted_at IS NULL', [$email]);
        if (false !== $id && $this->access->sender((int) $id) && $portalEmailLimiter->create($email)->consume()->isAccepted()) {
            $bus->dispatch(new SendPortalLink((int) $id));
        }

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/session', methods: 'POST')]
    public function signIn(Request $request): Response
    {
        // One statement: a link cannot be used twice, even concurrently.
        $id = $this->db->fetchOne('UPDATE portal_link SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND deleted_at IS NULL AND expires_at > ? RETURNING participant_id',
            [$now = (new \DateTimeImmutable())->format('Y-m-d H:i:s'), hash('sha256', $this->field($request, 'token')), $now]);
        if (false === $id) {
            throw new UnprocessableEntityHttpException('Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.');
        }
        $session = $request->getSession();
        $session->migrate(true);
        $session->set(self::SESSION_KEY, (int) $id);
        $this->em->persist(new AuditLog(null, 'PORTAL_LOGIN', 'Participant', (int) $id));
        $this->em->flush();

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/session', methods: 'DELETE')]
    public function signOut(Request $request): Response
    {
        $request->getSession()->remove(self::SESSION_KEY);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/me', methods: 'GET')]
    public function me(Request $request): JsonResponse
    {
        $participant = $this->participant($request);

        return $this->json([
            'firstName' => $participant->firstName, 'lastName' => $participant->lastName, 'email' => $participant->email,
            'formations' => array_map(function (array $r) use ($participant): array {
                $id = (int) $participant->getId();

                return ['id' => (int) $r['id'], 'session' => $r['session'], 'formation' => $r['formation'], 'organization' => $r['organization'],
                    'accessStartsOn' => $r['starts_on'], 'accessEndsOn' => $r['ends_on'], 'open' => $r['open'],
                    // Outside the access dates, only the formation and its dates remain visible.
                    'resources' => $r['open'] ? $this->access->resources((int) $r['formation_id'], (int) $r['session_formation_id']) : [],
                    'classes' => $r['open'] ? $this->access->classes($id, (int) $r['session_formation_id']) : []];
            }, $this->access->registrations((int) $participant->getId())),
        ], headers: ['Cache-Control' => 'private, no-store']);
    }

    #[Route('/resources/{id<\d+>}/file', methods: 'GET')]
    public function resourceFile(int $id, Request $request): Response
    {
        $file = $this->access->file((int) $this->participant($request)->getId(), $id) ?? throw $this->createNotFoundException();

        return ResourceController::download($file['file_name'], $file['mime'], $file['content']);
    }

    private function field(Request $request, string $name): string
    {
        $body = json_decode($request->getContent(), true);

        return is_array($body) && is_string($body[$name] ?? null) ? $body[$name] : '';
    }

    private function participant(Request $request): Participant
    {
        $id = $request->hasPreviousSession() ? $request->getSession()->get(self::SESSION_KEY) : null;
        $filters = $this->em->getFilters();
        if ($filters->isEnabled('organization_scope')) {
            $filters->disable('organization_scope');
        }
        $participant = $id ? $this->em->find(Participant::class, $id) : null;

        return $participant && !$participant->getDeletedAt() ? $participant : throw new UnauthorizedHttpException('portal', 'Connectez-vous avec le lien reçu par e-mail.');
    }
}
