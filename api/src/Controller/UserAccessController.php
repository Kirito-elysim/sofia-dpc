<?php

namespace App\Controller;

use App\Entity\User;
use App\Service\AccessMailer;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

class UserAccessController extends AbstractController
{
    #[Route('/api/users/{id<\d+>}/access', methods: 'POST')]
    #[IsGranted('ROLE_SUPER_ADMIN')]
    public function __invoke(int $id, EntityManagerInterface $em, AccessMailer $mailer): Response
    {
        $user = $em->find(User::class, $id) ?? throw $this->createNotFoundException('Compte introuvable.');
        if ($user === $this->getUser()) {
            throw new ConflictHttpException('Vous ne pouvez pas réinitialiser votre propre mot de passe ici.');
        }
        if (!$user->canLogin()) {
            throw new ConflictHttpException('Activez le compte avant de renvoyer un accès.');
        }
        $mailer->invite($user);

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}
