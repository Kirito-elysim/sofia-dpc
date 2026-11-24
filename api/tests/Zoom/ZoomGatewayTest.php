<?php

namespace App\Tests\Zoom;

use App\Entity\{ClassSlot, Organization, TimeSlot, Training, VirtualClass, ZoomAccount};
use App\Zoom\ZoomGateway;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class ZoomGatewayTest extends TestCase
{
    public function testOAuthRefreshAndMeetingCreation(): void
    {
        $account = new ZoomAccount('Test', 'host@example.test', 'A');
        $day = new \DateTimeImmutable('2030-06-03', new \DateTimeZone('Europe/Paris'));
        $slot = new ClassSlot(new VirtualClass(new Training(new Organization('Test', 'TEST', 'demo@example.test'), 'Cours'), $day), new TimeSlot('Matin', '09:00', '13:00'));
        $slot->zoomAccount = $account;
        $slot->startsAt = $day->setTime(9, 0);
        $slot->endsAt = $day->setTime(13, 0);
        $meeting = new MockResponse('{"id":12345678901}');
        $http = new MockHttpClient([new MockResponse('{"access_token":"old"}'), new MockResponse('', ['http_code' => 401]), new MockResponse('{"access_token":"new"}'), $meeting]);
        $gateway = new ZoomGateway($http, ['A' => ['account_id' => 'test', 'client_id' => 'test', 'client_secret' => 'test']], new ArrayAdapter());
        self::assertSame('12345678901', $gateway->createMeeting($slot));
        self::assertSame(4, $http->getRequestsCount());
        $body = json_decode($meeting->getRequestOptions()['body'], true);
        self::assertSame(240, $body['duration']);
        self::assertSame('09:00:00', substr($body['start_time'], -8));
    }
}
