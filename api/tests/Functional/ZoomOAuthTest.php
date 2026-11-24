<?php

namespace App\Tests\Functional;

use App\Zoom\ZoomOAuth;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class ZoomOAuthTest extends KernelTestCase
{
    public function testOAuthConnectionAndRefreshKeepTokensEncrypted(): void
    {
        $db=static::getContainer()->get(Connection::class);
        $key=sys_get_temp_dir().'/sofia-zoom-'.bin2hex(random_bytes(12));
        $http=new MockHttpClient([
            new MockResponse('{"access_token":"initial-token","refresh_token":"initial-refresh","expires_in":3600}'),
            new MockResponse('{"account_id":"oauth-test-account"}'),
            new MockResponse('{"access_token":"new-token","refresh_token":"new-refresh","expires_in":3600}'),
        ]);
        $oauth=new ZoomOAuth($db,$http,$key);
        $db->beginTransaction();
        try {
            $db->executeStatement('DELETE FROM zoom_oauth_app');
            $db->insert('zoom_oauth_app',['id'=>1,'client_id'=>'test','secret'=>$oauth->seal('client-secret'),
                'redirect_uri'=>'https://example.test/api/zoom-oauth/callback']);
            $oauth->connect('fake-code','test');
            $row=$db->fetchAssociative('SELECT id,tokens FROM zoom_oauth_connection WHERE account_id=?',['oauth-test-account']);
            self::assertIsArray($row);
            self::assertStringNotContainsString('initial-token',$row['tokens']);
            self::assertSame('initial-token',$oauth->token($row['id']));
            self::assertSame('new-token',$oauth->token($row['id'],'initial-token'));
            self::assertSame('new-token',$oauth->token($row['id'],'initial-token'));
            self::assertSame(3,$http->getRequestsCount());
        } finally {
            $db->rollBack();
            if (is_file($key)) {
                unlink($key);
            }
        }
    }
}
