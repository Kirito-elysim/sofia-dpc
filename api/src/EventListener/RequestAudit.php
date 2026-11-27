<?php

namespace App\EventListener;

use App\Entity\AuditLog;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsEntityListener;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\Events;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpKernel\Event\ResponseEvent;

/**
 * Attaches the received payload to each audit row, and writes a row of its own for every write request
 * that left none (raw SQL controllers) or that was refused.
 */
#[AsEntityListener(event: Events::prePersist, method: 'attach', entity: AuditLog::class)]
#[AsEventListener(event: 'kernel.response', method: 'trace')]
final class RequestAudit
{
    private const AUDITED = '_audited';

    public function __construct(private RequestStack $requests, private Security $security, private Connection $db)
    {
    }

    public function attach(AuditLog $log): void
    {
        if ($request = $this->requests->getMainRequest()) {
            $log->request = $this->describe($request);
            $log->ip ??= $request->getClientIp();
            $request->attributes->set(self::AUDITED, true);
        }
    }

    public function trace(ResponseEvent $event): void
    {
        $request = $event->getRequest();
        $path = $request->getPathInfo();
        // Login has its own events; Zoom webhooks are machine traffic stored as attendance events.
        if (!$event->isMainRequest() || $request->isMethodSafe() || !str_starts_with($path, '/api/')
            || '/api/auth/login' === $path || str_contains($path, '/webhooks/')) {
            return;
        }
        $status = $event->getResponse()->getStatusCode();
        $user = $this->security->getUser()?->getUserIdentifier();
        // A refusal rolls back any row written on the way, so it is always traced. Anonymous noise is not.
        if (($status < 400 && $request->attributes->get(self::AUDITED)) || (null === $user && $status >= 400)) {
            return;
        }
        $described = $this->describe($request) + ['status' => $status];
        $action = match (true) {
            $status >= 400 => 'REQUEST_FAILED',
            '/api/auth/logout' === $path => 'LOGOUT',
            $request->isMethod('DELETE') => 'DELETE',
            true === ($described['payload']['archived'] ?? null) => 'ARCHIVE',
            default => 'UPDATE',
        };
        preg_match('~^/api/([a-z-]+)(?:.*?/(\d+))?~', $path, $route);
        $this->db->insert('audit_log', [
            'at' => (new \DateTimeImmutable())->format('Y-m-d H:i:s'), 'user_email' => $user, 'action' => $action,
            'entity' => $route[1] ?? null, 'entity_id' => $route[2] ?? null, 'data' => '[]', 'ip' => $request->getClientIp(),
            'request' => json_encode($described, JSON_INVALID_UTF8_SUBSTITUTE),
        ]);
    }

    /** @return array{method: string, path: string, payload: mixed} */
    private function describe(Request $request): array
    {
        $body = $request->getContent();
        $payload = '' === $body ? null : json_decode($body, true);
        // An unreadable body may hold secrets: only its size is kept.
        if (null === $payload && '' !== $body) {
            $payload = '[contenu non JSON, '.strlen($body).' octets]';
        }
        if ($request->request->count() || $request->files->count()) {
            $files = $request->files->all();
            array_walk_recursive($files, static function (mixed &$file): void {
                $file = $file instanceof UploadedFile ? ['name' => $file->getClientOriginalName(), 'bytes' => (int) @filesize($file->getPathname())] : null;
            });
            $payload = $request->request->all() + ($files ? ['files' => $files] : []);
        }

        return ['method' => $request->getMethod(), 'path' => $request->getPathInfo(), 'payload' => AuditPayload::clean($payload)];
    }
}
