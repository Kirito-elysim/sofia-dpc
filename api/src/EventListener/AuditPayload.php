<?php

namespace App\EventListener;

/** What may be written to the audit trail: secrets are masked, files and long texts are shortened. */
final class AuditPayload
{
    public static function sensitive(string $key): bool
    {
        return 1 === preg_match('~password|secret|token|client_?id|account_?id|authorization|signature|credential|api_?key|(join|start)_?url~i', $key);
    }

    public static function clean(mixed $value): mixed
    {
        if (is_array($value)) {
            $out = [];
            foreach ($value as $key => $item) {
                $out[$key] = self::sensitive((string) $key) ? '[masqué]' : self::clean($item);
            }

            return $out;
        }
        if (!is_string($value)) {
            return $value;
        }
        if (str_starts_with($value, 'data:') || !mb_check_encoding($value, 'UTF-8') || preg_match('~\A[A-Za-z0-9+/\r\n]{500,}={0,2}\z~', $value)) {
            return '[fichier, '.(int) ceil(strlen($value) / 1024).' Ko]';
        }

        return mb_strlen($value) > 5000 ? mb_substr($value, 0, 5000).'… [tronqué]' : $value;
    }
}
