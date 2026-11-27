<?php

namespace App\Message;

/** The token is created by the handler, so it never sits in the queue. */
final class SendPortalLink
{
    public function __construct(public int $participantId)
    {
    }
}
