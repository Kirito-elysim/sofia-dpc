<?php

namespace App\Zoom;

use App\Entity\ClassSlot;
use App\Entity\ZoomAccount;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class ZoomGateway
{
    /** @param array<string,array<string,string>> $profiles */
    public function __construct(
        private HttpClientInterface $http,
        #[Autowire('%env(json:ZOOM_PROFILES)%')] private array $profiles,
        #[Autowire(service: 'cache.zoom_tokens')] private CacheItemPoolInterface $tokens,
        private ?ZoomOAuth $oauth = null,
    ) {}

    private function cacheKey(ZoomAccount $account): string
    {
        return $account->sealedCredentials() === null ? $account->profile : 'managed.'.$account->getId();
    }

    private function token(ZoomAccount $account): string
    {
        $item = $this->tokens->getItem($this->cacheKey($account));
        if ($item->isHit() && is_string($cached = $item->get())) {
            return $cached;
        }
        $credentials = $this->profiles[$account->profile] ?? [];
        if (($sealed = $account->sealedCredentials()) !== null) {
            $oauth = $this->oauth ?? throw new \LogicException('Connecteur Zoom indisponible.');
            $credentials = json_decode($oauth->open($sealed), true, 512, JSON_THROW_ON_ERROR);
        }
        foreach (['client_id','client_secret','account_id'] as $field) {
            if (($credentials[$field] ?? '') === '') {
                throw new \RuntimeException('Configuration Zoom incomplète pour ce compte.');
            }
        }
        $result = $this->http->request('POST', 'https://zoom.us/oauth/token', [
            'auth_basic' => [$credentials['client_id'], $credentials['client_secret']],
            'body' => ['grant_type' => 'account_credentials', 'account_id' => $credentials['account_id']],
            'max_redirects' => 0, 'timeout' => 15,
        ])->toArray();
        $value = $result['access_token'] ?? '';
        if (!is_string($value) || '' === $value) {
            throw new \RuntimeException('Authentification Zoom refusée.');
        }
        $item->set($value)->expiresAfter(max(1, (int) ($result['expires_in'] ?? 3600) - 300));
        $this->tokens->save($item);
        return $value;
    }

    public function createMeeting(ClassSlot $slot): string
    {
        $account = $slot->zoomAccount;
        if (!$account || !$slot->startsAt || !$slot->endsAt) {
            throw new \LogicException('Réservation Zoom manquante.');
        }
        $options = ['max_redirects' => 0, 'timeout' => 20, 'json' => [
            'type' => 2, 'topic' => $slot->virtualClass->formation->title,
            'start_time' => $slot->startsAt->format('Y-m-d\TH:i:s'), 'timezone' => 'Europe/Paris',
            'duration' => (int) (($slot->endsAt->getTimestamp() - $slot->startsAt->getTimestamp()) / 60),
            'settings' => ['approval_type' => 0, 'registrants_confirmation_email' => true, 'registrants_email_notification' => false],
        ]];
        if ($slot->zoomPolicy !== null) {
            $options['json']=ClassPolicy::apply($options['json'],$slot->zoomPolicy['requested']);
        }
        $url = 'https://api.zoom.us/v2/users/'.rawurlencode($account->hostUserId).'/meetings';
        $response = $this->request($account, 'POST', $url, $options);
        $meeting=$response->toArray();
        $number = (string) ($meeting['id'] ?? '');
        if (!preg_match('/^[0-9]{9,11}$/D', $number)) {
            throw new \RuntimeException('Réponse Zoom sans numéro de réunion.');
        }
        if ($slot->zoomPolicy !== null) {
            $effective=ClassPolicy::effective($meeting);
            if (in_array(null,$effective,true)) {
                try {
                    $details=$this->request($account,'GET','https://api.zoom.us/v2/meetings/'.$number,['timeout'=>10,'max_redirects'=>0])->toArray();
                    $effective=ClassPolicy::effective(array_replace_recursive($meeting,$details));
                } catch (\Exception) {
                    // The meeting exists. Unknown settings remain visible for review.
                }
            }
            $slot->zoomPolicy['effective']=$effective;
        }
        return $number;
    }


    private function request(ZoomAccount $account, string $method, string $url, array $options): \Symfony\Contracts\HttpClient\ResponseInterface
    {
        if (($connection=$account->oauthConnectionId()) !== null) {
            $oauth=$this->oauth ?? throw new \LogicException('Connecteur OAuth indisponible.');
            $token=$oauth->token($connection);
            $response=$this->http->request($method,$url,$options+['auth_bearer'=>$token]);
            return $response->getStatusCode()===401
                ? $this->http->request($method,$url,$options+['auth_bearer'=>$oauth->token($connection,$token)])
                : $response;
        }
        $response = $this->http->request($method, $url, $options + ['auth_bearer' => $this->token($account)]);
        if (401 === $response->getStatusCode()) {
            $this->tokens->deleteItem($this->cacheKey($account));
            $response = $this->http->request($method, $url, $options + ['auth_bearer' => $this->token($account)]);
        }
        return $response;
    }

    public function register(ZoomAccount $account,string $meeting,string $first,string $last,string $email): array
    {
        $result=$this->request($account,'POST','https://api.zoom.us/v2/meetings/'.rawurlencode($meeting).'/registrants',[
            'json'=>['first_name'=>$first,'last_name'=>$last,'email'=>$email],'timeout'=>20,'max_redirects'=>0,
        ])->toArray();
        $id=$result['registrant_id']??null;
        $url=$result['join_url']??null;
        if (!is_string($id) || $id==='' || !self::validJoinUrl($url)) { throw new \RuntimeException('Réponse d’inscription Zoom incomplète.'); }
        return [$id,$url];
    }

    public static function validJoinUrl(mixed $url): bool
    {
        return is_string($url) && filter_var($url,FILTER_VALIDATE_URL) && parse_url($url,PHP_URL_SCHEME)==='https';
    }

    public function cancelRegistration(ZoomAccount $account,string $meeting,string $id,string $email): void
    {
        $this->request($account,'PUT','https://api.zoom.us/v2/meetings/'.rawurlencode($meeting).'/registrants/status',[
            'json'=>['action'=>'cancel','registrants'=>[['id'=>$id,'email'=>$email]]],'timeout'=>20,'max_redirects'=>0,
        ])->getContent();
    }
}
