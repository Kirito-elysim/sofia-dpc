<?php

namespace App\Zoom;

use Doctrine\DBAL\Connection;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class ZoomOAuth
{
    public function __construct(private Connection $db, private HttpClientInterface $http,
        #[Autowire('%kernel.project_dir%/var/zoom-oauth.key')] private string $keyPath) {}

    private function key(): string
    {
        $file=@fopen($this->keyPath,'x+b');
        if ($file !== false) {
            try {
                chmod($this->keyPath,0600);
                $key=random_bytes(SODIUM_CRYPTO_SECRETBOX_KEYBYTES);
                if (fwrite($file,$key)!==strlen($key)) {
                    throw new \RuntimeException('Impossible d’écrire la clé du connecteur Zoom.');
                }
                return $key;
            } finally {
                fclose($file);
            }
        }
        $key=@file_get_contents($this->keyPath);
        if ($key===false || strlen($key)!==SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
            throw new \RuntimeException('Clé du connecteur Zoom indisponible.');
        }
        return $key;
    }

    public function seal(string $plain): string
    {
        $nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode($nonce.sodium_crypto_secretbox($plain,$nonce,$this->key()));
    }

    public function open(string $value): string
    {
        $packed=base64_decode($value,true);
        $size=SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
        if ($packed===false || strlen($packed)<$size+SODIUM_CRYPTO_SECRETBOX_MACBYTES ||
            false===($plain=sodium_crypto_secretbox_open(substr($packed,$size),substr($packed,0,$size),$this->key()))) {
            throw new \RuntimeException('Identifiant Zoom illisible.');
        }
        return $plain;
    }

    public function app(): array
    {
        return $this->db->fetchAssociative('SELECT * FROM zoom_oauth_app WHERE id=1') ?: throw new \RuntimeException('Configurez l’application OAuth Sofia.');
    }

    private function exchange(array $app,array $body): array
    {
        $tokens=$this->http->request('POST','https://zoom.us/oauth/token',[
            'auth_basic'=>[$app['client_id'],$this->open($app['secret'])],
            'body'=>$body,'max_redirects'=>0,'timeout'=>15,
        ])->toArray();
        if (empty($tokens['access_token']) || empty($tokens['refresh_token'])) {
            throw new \RuntimeException('Zoom n’a pas fourni les jetons requis.');
        }
        return $tokens;
    }

    public function connect(string $code,string $clientId): void
    {
        $app=$this->app();
        if ($app['client_id']!==$clientId) {
            throw new \RuntimeException('L’application OAuth a changé.');
        }
        $tokens=$this->exchange($app,['grant_type'=>'authorization_code','code'=>$code,'redirect_uri'=>$app['redirect_uri']]);
        $user=$this->get('/users/me',$tokens['access_token']);
        $account=$user['account_id']??null;
        if (!is_string($account) || $account==='') {
            throw new \RuntimeException('Impossible d’identifier le compte Zoom.');
        }
        $this->db->executeStatement('INSERT INTO zoom_oauth_connection(account_id,tokens,expires_at) VALUES (?,?,?)
            ON CONFLICT(account_id) DO UPDATE SET tokens=excluded.tokens,expires_at=excluded.expires_at',
            [$account,$this->seal(json_encode($tokens,JSON_THROW_ON_ERROR)),time()+(int)($tokens['expires_in']??3600)]);
    }

    public function token(int $id,?string $rejected=null): string
    {
        return $this->db->transactional(function(Connection $db) use ($id,$rejected): string {
            $row=$db->fetchAssociative('SELECT * FROM zoom_oauth_connection WHERE id=? FOR UPDATE',[$id]);
            if (!$row) {
                throw new \RuntimeException('Connexion Zoom introuvable.');
            }
            $tokens=json_decode($this->open($row['tokens']),true,512,JSON_THROW_ON_ERROR);
            if ($row['expires_at']>time()+60 && $tokens['access_token']!==$rejected) {
                return $tokens['access_token'];
            }
            $tokens=$this->exchange($this->app(),['grant_type'=>'refresh_token','refresh_token'=>$tokens['refresh_token']]);
            $db->update('zoom_oauth_connection',['tokens'=>$this->seal(json_encode($tokens,JSON_THROW_ON_ERROR)),
                'expires_at'=>time()+(int)($tokens['expires_in']??3600)],['id'=>$id]);
            return $tokens['access_token'];
        });
    }

    public function get(string $path,string $token,array $query=[]): array
    {
        return $this->http->request('GET','https://api.zoom.us/v2'.$path,[
            'auth_bearer'=>$token,'query'=>$query,'timeout'=>15,'max_redirects'=>0,
        ])->toArray();
    }
}
