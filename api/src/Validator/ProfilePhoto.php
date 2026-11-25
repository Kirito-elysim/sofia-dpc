<?php

namespace App\Validator;

final class ProfilePhoto
{
    public const MESSAGE = 'Choisissez une image JPG ou PNG de 2 Mo maximum.';

    /** A data URL holding a real JPEG or PNG of 2 MB at most. */
    public static function isValid(string $photo): bool
    {
        if (strlen($photo) > 2796230 || !preg_match('~^data:(image/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$~D', $photo, $parts)) {
            return false;
        }
        $bytes = base64_decode($parts[2], true);
        $info = false !== $bytes && strlen($bytes) <= 2 * 1024 * 1024 ? @getimagesizefromstring($bytes) : false;

        return $info && $info['mime'] === $parts[1];
    }
}
