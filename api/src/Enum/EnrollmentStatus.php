<?php

namespace App\Enum;

enum EnrollmentStatus: string
{
    case ACTIVE = 'ACTIVE';
    case CANCELLED = 'CANCELLED';
}
