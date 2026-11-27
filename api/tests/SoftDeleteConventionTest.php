<?php

namespace App\Tests;

use App\Entity\AuditLog;
use App\Entity\SoftDeletable;
use PHPUnit\Framework\TestCase;

class SoftDeleteConventionTest extends TestCase
{
    public function testEveryEntityKeepsADeletionDate(): void
    {
        foreach (glob(__DIR__.'/../src/Entity/*.php') ?: [] as $file) {
            $class = 'App\\Entity\\'.basename($file, '.php');
            // The journal is append-only: its rows are never deleted.
            if (SoftDeletable::class === $class || AuditLog::class === $class) {
                continue;
            }
            self::assertTrue(is_subclass_of($class, SoftDeletable::class), "$class must extend SoftDeletable.");
        }
    }
}
