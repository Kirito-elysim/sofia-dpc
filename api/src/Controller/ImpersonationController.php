<?php

namespace App\Controller;

use App\Entity\AuditLog;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorageInterface;
use Symfony\Component\Security\Core\Authentication\Token\SwitchUserToken;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/** "Se connecter en tant que". POST only: Symfony's switch_user parameter also fires on a plain link. */
class ImpersonationController extends AbstractController
{
    public function __construct(private TokenStorageInterface $tokens, private EntityManagerInterface $em)
    {
    }

    #[Route('/api/auth/impersonate/{id<\d+>}', methods: 'POST')]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function start(int $id, Request $request): Response
    {
        $original = $this->tokens->getToken();
        if (!$original || $original instanceof SwitchUserToken) {
            throw new ConflictHttpException('Revenez d’abord à votre compte.');
        }
        $target = $this->em->find(User::class, $id) ?? throw $this->createNotFoundException('Compte introuvable.');
        // Never another super admin (this also excludes oneself).
        if ('ROLE_SUPER_ADMIN' === $target->getRole() || !$target->canLogin()) {
            throw $this->createAccessDeniedException('Ce compte ne permet pas la connexion en tant que.');
        }
        $this->em->persist(new AuditLog($original->getUserIdentifier(), 'IMPERSONATION_START', 'User', $id, ['target' => $target->email], $request->getClientIp()));
        $this->em->flush();
        $request->getSession()->migrate(true);
        $this->tokens->setToken(new SwitchUserToken($target, 'main', $target->getRoles(), $original));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }

    #[Route('/api/auth/impersonate/exit', methods: 'POST')]
    public function stop(Request $request): Response
    {
        $token = $this->tokens->getToken();
        if (!$token instanceof SwitchUserToken) {
            throw new ConflictHttpException('Aucune connexion en tant que en cours.');
        }
        $original = $token->getOriginalToken();
        $target = $token->getUser();
        $this->em->persist(new AuditLog($original->getUserIdentifier(), 'IMPERSONATION_STOP', 'User', $target instanceof User ? $target->getId() : null, ['target' => $token->getUserIdentifier()], $request->getClientIp()));
        $this->tokens->setToken($original);
        $this->em->flush();
        $request->getSession()->migrate(true);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}
