<?php

namespace App\Enum;

enum ClassStatus: string
{
    case PLANNED = 'PLANNED';
    case IN_PROGRESS = 'IN_PROGRESS';
    case DONE = 'DONE';
    case CANCELLED = 'CANCELLED';
}
