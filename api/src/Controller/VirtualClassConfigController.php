<?php

namespace App\Controller;

use App\Zoom\ClassPolicy;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{JsonResponse,Request};
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[IsGranted('ROLE_ADMIN')]
final class VirtualClassConfigController extends AbstractController
{
    #[Route('/api/virtual-class-configs',methods:['GET'])]
    public function list(Connection $db): JsonResponse
    {
        $items=$db->fetchAllAssociative('SELECT * FROM virtual_class_config ORDER BY id');
        $organizations=$db->fetchAllAssociative('SELECT id,name,virtual_class_config_id AS config FROM organization ORDER BY name');
        foreach ($items as &$item) {
            $item['policy']=json_decode($item['policy'],true,512,JSON_THROW_ON_ERROR);
            $item['hosts']=json_decode($item['hosts'],true,512,JSON_THROW_ON_ERROR);
        }
        return $this->json(['items'=>$items,'organizations'=>$organizations,
            'hosts'=>$db->fetchAllAssociative('SELECT id,label,active FROM zoom_account ORDER BY label')]);
    }

    #[Route('/api/virtual-class-configs',methods:['POST'])]
    public function save(Request $request,Connection $db): JsonResponse
    {
        $input=$request->toArray();
        try {
            $policy=ClassPolicy::validate($input['policy']??null);
            $name=is_string($input['name']??null)?trim($input['name']):'';
            $id=$input['id']??null;
            $hosts=$this->ids($input['hosts']??null);
            $organizations=$this->ids($input['organizations']??null);
            $archived=$input['archived']??false;
            if ($name==='' || mb_strlen($name)>100 || ($id!==null && (!is_int($id) || $id<1)) || !is_bool($archived) || (!$archived && !$hosts)) {
                throw new \InvalidArgumentException('Le nom et au moins un compte hôte sont requis.');
            }
            $saved=$db->transactional(function(Connection $db) use ($id,$name,$policy,$hosts,$organizations,$archived) {
                $db->executeQuery("SELECT pg_advisory_xact_lock(hashtext('virtual-class-config'))");
                foreach ($hosts as $host) {
                    if (!$db->fetchOne('SELECT id FROM zoom_account WHERE id=?',[$host])) {
                        throw new \InvalidArgumentException('Compte hôte introuvable.');
                    }
                }
                foreach ($organizations as $organization) {
                    if (!$db->fetchOne('SELECT id FROM organization WHERE id=?',[$organization])) {
                        throw new \InvalidArgumentException('Organisme introuvable.');
                    }
                }
                $values=[$name,json_encode($policy,JSON_THROW_ON_ERROR),json_encode($hosts,JSON_THROW_ON_ERROR),$archived?'true':'false'];
                if ($id===null) {
                    $id=(int)$db->fetchOne('INSERT INTO virtual_class_config(name,policy,hosts,archived) VALUES (?,?,?,?) RETURNING id',$values);
                } elseif (!$db->executeStatement('UPDATE virtual_class_config SET name=?,policy=?,hosts=?,archived=? WHERE id=?',[...$values,$id])) {
                    throw new \InvalidArgumentException('Configuration introuvable.');
                }
                $db->executeStatement('UPDATE organization SET virtual_class_config_id=NULL WHERE virtual_class_config_id=?',[$id]);
                if (!$archived) {
                    foreach ($organizations as $organization) {
                        $db->update('organization',['virtual_class_config_id'=>$id],['id'=>$organization]);
                    }
                }
                return $id;
            });
        } catch (\InvalidArgumentException $error) {
            return $this->json(['detail'=>$error->getMessage()],422);
        }
        return $this->json(['id'=>$saved]);
    }

    private function ids(mixed $values): array
    {
        if (!is_array($values) || !array_is_list($values)) {
            throw new \InvalidArgumentException('Sélection invalide.');
        }
        foreach ($values as $id) {
            if (!is_int($id) || $id<1) {
                throw new \InvalidArgumentException('Identifiant invalide.');
            }
        }
        return array_values(array_unique($values));
    }
}
