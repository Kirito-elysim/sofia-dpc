<?php

namespace App\Controller;

use App\Zoom\ClassPolicy;
use App\Zoom\ZoomOAuth;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{JsonResponse,RedirectResponse,Request};
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/zoom-oauth')]
#[IsGranted('ROLE_SUPER_ADMIN')]
final class ZoomOAuthController extends AbstractController
{
    #[Route('',methods:['GET'])]
    public function status(Connection $db): JsonResponse
    {
        return $this->json([
            'app'=>$db->fetchAssociative('SELECT client_id AS "clientId",redirect_uri AS "redirectUri" FROM zoom_oauth_app WHERE id=1') ?: null,
            'connections'=>$db->fetchAllAssociative('SELECT id,account_id AS "accountId" FROM zoom_oauth_connection ORDER BY id'),
            'organizations'=>$db->fetchAllAssociative('SELECT id,name FROM organization WHERE active ORDER BY name'),
        ]);
    }

    #[Route('/application',methods:['POST'])]
    public function configure(Request $request,Connection $db,ZoomOAuth $oauth): JsonResponse
    {
        $input=$request->toArray();
        $client=$input['clientId']??null;
        $secret=$input['clientSecret']??null;
        $redirect=$input['redirectUri']??null;
        $webhook=$input['webhookSecret']??null;
        if (!is_string($client) || trim($client)==='' || !is_string($secret) || trim($secret)==='' ||
            !is_string($redirect) || !filter_var($redirect,FILTER_VALIDATE_URL) || parse_url($redirect,PHP_URL_SCHEME)!=='https' ||
            parse_url($redirect,PHP_URL_PATH)!=='/api/zoom-oauth/callback' || parse_url($redirect,PHP_URL_QUERY)!==null ||
            parse_url($redirect,PHP_URL_FRAGMENT)!==null || ($webhook!==null && !is_string($webhook))) {
            return $this->json(['detail'=>'Client ID, Client Secret et URL HTTPS /api/zoom-oauth/callback requis.'],422);
        }
        try {
            $saved=$db->executeStatement('INSERT INTO zoom_oauth_app(id,client_id,secret,redirect_uri,webhook_secret)
                VALUES (1,?,?,?,?) ON CONFLICT(id) DO NOTHING',
                [$client,$oauth->seal($secret),$redirect,$webhook ? $oauth->seal($webhook) : null]);
        } catch (\RuntimeException $error) {
            return $this->json(['detail'=>$error->getMessage()],422);
        }
        return $saved ? $this->json(['configured'=>true],201) : $this->json(['detail'=>'L’application OAuth est déjà configurée.'],409);
    }

    #[Route('/start',methods:['POST'])]
    public function start(Request $request,ZoomOAuth $oauth): JsonResponse
    {
        try {
            $app=$oauth->app();
        } catch (\RuntimeException $error) {
            return $this->json(['detail'=>$error->getMessage()],422);
        }
        $state=bin2hex(random_bytes(32));
        $request->getSession()->set('zoom_oauth_state',[$state,time()+600,$app['client_id'],$this->getUser()?->getUserIdentifier()]);
        return $this->json(['url'=>'https://zoom.us/oauth/authorize?'.http_build_query([
            'response_type'=>'code','client_id'=>$app['client_id'],'redirect_uri'=>$app['redirect_uri'],'state'=>$state,
        ],'', '&', PHP_QUERY_RFC3986)]);
    }

    #[Route('/callback',methods:['GET'])]
    public function callback(Request $request,ZoomOAuth $oauth): RedirectResponse
    {
        $state=$request->getSession()->remove('zoom_oauth_state');
        $code=$request->query->getString('code');
        $valid=is_array($state) && $state[1]>=time() && $state[3]===$this->getUser()?->getUserIdentifier()
            && hash_equals($state[0],$request->query->getString('state')) && $code!=='';
        if ($valid) {
            try {
                $oauth->connect($code,$state[2]);
                return $this->redirect('/settings/zoom-accounts?zoom=connected');
            } catch (\Exception) {
                // Avoid sending the provider response, authorization code or tokens to the browser.
            }
        }
        return $this->redirect('/settings/zoom-accounts?zoom=error');
    }

    private function hosts(ZoomOAuth $oauth,int $id,string $page): array
    {
        $result=$oauth->get('/users',$oauth->token($id),['status'=>'active','page_size'=>100,'next_page_token'=>$page]);
        return ['hosts'=>array_map(static fn(array $user): array=>[
            'id'=>$user['id'],'label'=>trim(($user['first_name']??'').' '.($user['last_name']??'')) ?: ($user['email']??$user['id']),
            'email'=>$user['email']??null,
        ],$result['users']??[]),'next'=>$result['next_page_token']??''];
    }

    #[Route('/{id}/hosts',requirements:['id'=>'\d+'],methods:['GET'])]
    public function listHosts(int $id,Request $request,ZoomOAuth $oauth): JsonResponse
    {
        try {
            return $this->json($this->hosts($oauth,$id,$request->query->getString('page')));
        } catch (\Exception) {
            return $this->json(['detail'=>'Impossible de lister les hôtes. Vérifiez les autorisations ou reconnectez le compte Zoom.'],502);
        }
    }

    #[Route('/{id}/hosts',requirements:['id'=>'\d+'],methods:['POST'])]
    public function import(int $id,Request $request,ZoomOAuth $oauth,Connection $db): JsonResponse
    {
        $input=$request->toArray();
        $organization=$input['organization']??null;
        $selected=$input['hosts']??null;
        if (!is_int($organization) || !is_array($selected) || !$selected || count($selected)>100 ||
            array_filter($selected,static fn($host)=>!is_string($host)||!preg_match('/^[A-Za-z0-9_-]{1,180}$/D',$host))) {
            return $this->json(['detail'=>'Sélectionnez un organisme et au moins un hôte valide.'],422);
        }
        try {
            $users=[];
            $remaining=array_fill_keys($selected,true);
            $page='';
            do {
                $result=$this->hosts($oauth,$id,$page);
                foreach ($result['hosts'] as $host) {
                    if (isset($remaining[$host['id']])) {
                        $users[$host['id']]=$host['label'];
                        unset($remaining[$host['id']]);
                    }
                }
                $page=$result['next'];
            } while ($remaining && $page!=='');
            if ($remaining) {
                return $this->json(['detail'=>'Un hôte sélectionné est inactif ou introuvable dans ce compte.'],422);
            }
        } catch (\Exception) {
            return $this->json(['detail'=>'Zoom ne permet pas de vérifier les hôtes sélectionnés.'],502);
        }
        try {
            $db->transactional(function(Connection $db) use ($id,$organization,$users): void {
                $db->executeQuery("SELECT pg_advisory_xact_lock(hashtext('virtual-class-config'))");
                $org=$db->fetchAssociative('SELECT name,virtual_class_config_id FROM organization WHERE id=? AND active FOR UPDATE',[$organization]);
                if (!$org) {
                    throw new \DomainException('Organisme actif introuvable.');
                }
                $ids=[];
                foreach ($users as $host=>$label) {
                    $hostId=$db->fetchOne('INSERT INTO zoom_account(label,host_user_id,profile,active,oauth_connection_id)
                        VALUES (?,?,?,true,?) ON CONFLICT(host_user_id) DO UPDATE SET label=excluded.label
                        WHERE zoom_account.oauth_connection_id=excluded.oauth_connection_id RETURNING id',
                        [mb_substr($label,0,100),$host,'OAUTH_'.$id,$id]);
                    if (!$hostId) {
                        throw new \DomainException('Un hôte est déjà associé à une autre configuration Zoom.');
                    }
                    $ids[]=(int)$hostId;
                }
                $config=$org['virtual_class_config_id'];
                $current=$config ? $db->fetchAssociative('SELECT * FROM virtual_class_config WHERE id=?',[$config]) : null;
                $old=$current ? json_decode($current['hosts'],true,512,JSON_THROW_ON_ERROR) : [];
                $pool=json_encode(array_values(array_unique([...$old,...$ids])),JSON_THROW_ON_ERROR);
                if ($current && (int)$db->fetchOne('SELECT count(*) FROM organization WHERE virtual_class_config_id=?',[$config])===1) {
                    $db->update('virtual_class_config',['hosts'=>$pool],['id'=>$config]);
                } else {
                    $config=$db->fetchOne('INSERT INTO virtual_class_config(name,policy,hosts) VALUES (?,?,?) RETURNING id',
                        [mb_substr('Zoom · '.$org['name'],0,100),$current['policy']??json_encode(ClassPolicy::DEFAULT,JSON_THROW_ON_ERROR),$pool]);
                    $db->update('organization',['virtual_class_config_id'=>$config],['id'=>$organization]);
                }
            });
        } catch (\DomainException $error) {
            return $this->json(['detail'=>$error->getMessage()],409);
        }
        return $this->json(['imported'=>count($users)]);
    }
}
