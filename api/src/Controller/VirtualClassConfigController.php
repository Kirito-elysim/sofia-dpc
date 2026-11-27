<?php

namespace App\Controller;

use App\Security\OrganizationScope;
use App\Zoom\ClassPolicy;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{JsonResponse,Request};
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

final class VirtualClassConfigController extends AbstractController
{
    #[Route('/api/virtual-class-configs',methods:['GET'])]
    #[IsGranted('SOFIA_CONFIGS')]
    public function list(Connection $db, OrganizationScope $scope): JsonResponse
    {
        $items=$db->fetchAllAssociative('SELECT * FROM virtual_class_config ORDER BY id');
        $organizations=$db->fetchAllAssociative('SELECT id,name,code,color,virtual_class_config_id AS config FROM organization WHERE deleted_at IS NULL AND '.$scope->sql('id').' ORDER BY name');
        if ($scope->ids() !== null) {
            $items = array_values(array_filter($items, static fn ($item) => in_array($item['id'], array_column($organizations, 'config'))));
            $hostIds = $db->fetchFirstColumn('SELECT DISTINCT h.value::int FROM organization o
                JOIN virtual_class_config c ON c.id=o.virtual_class_config_id
                CROSS JOIN LATERAL jsonb_array_elements_text(c.hosts) h WHERE '.$scope->sql('o.id'));
        }
        foreach ($items as &$item) {
            $item['policy']=json_decode($item['policy'],true,512,JSON_THROW_ON_ERROR);
            $item['hosts']=json_decode($item['hosts'],true,512,JSON_THROW_ON_ERROR);
        }
        return $this->json(['items'=>$items,'organizations'=>$organizations,
            'hosts'=>$db->fetchAllAssociative('SELECT id,label,active FROM zoom_account WHERE '.(isset($hostIds) ? 'id IN ('.implode(',', array_map('intval', $hostIds ?: [0])).')' : 'TRUE').' ORDER BY label')]);
    }

    #[Route('/api/virtual-class-configs',methods:['POST'])]
    #[IsGranted('SOFIA_EDIT_CONFIGS')]
    public function save(Request $request,Connection $db, OrganizationScope $scope): JsonResponse
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
            $saved=$db->transactional(function(Connection $db) use ($id,$name,$policy,$hosts,$organizations,$archived,$scope) {
                $db->executeQuery("SELECT pg_advisory_xact_lock(hashtext('virtual-class-config'))");
                if ($scope->ids() !== null) {
                    if ($id === null && !$organizations) {
                        throw new \InvalidArgumentException('Sélectionnez un organisme de votre périmètre.');
                    }
                    if ($id !== null) {
                        $owners = $db->fetchFirstColumn('SELECT id FROM organization WHERE virtual_class_config_id=?', [$id]);
                        if (!$owners) {
                            throw $this->createAccessDeniedException();
                        }
                        foreach ($owners as $owner) {
                            $scope->require((int) $owner);
                        }
                    }
                }
                foreach ($hosts as $host) {
                    if ($scope->ids() !== null && !$db->fetchOne('SELECT 1 FROM organization o JOIN virtual_class_config c ON c.id=o.virtual_class_config_id
                        WHERE '.$scope->sql('o.id').' AND c.hosts @> ?::jsonb', [json_encode([$host])])) {
                        throw $this->createAccessDeniedException('Ce compte hôte est hors de votre périmètre.');
                    }
                    if (!$db->fetchOne('SELECT id FROM zoom_account WHERE id=?',[$host])) {
                        throw new \InvalidArgumentException('Compte hôte introuvable.');
                    }
                }
                foreach ($organizations as $organization) {
                    $scope->require($organization);
                    if (!$db->fetchOne('SELECT id FROM organization WHERE id=? AND deleted_at IS NULL',[$organization])) {
                        throw new \InvalidArgumentException('Organisme introuvable.');
                    }
                }
                $values=[$name,json_encode($policy,JSON_THROW_ON_ERROR),json_encode($hosts,JSON_THROW_ON_ERROR),$archived?'true':'false'];
                if ($id===null) {
                    $id=(int)$db->fetchOne('INSERT INTO virtual_class_config(name,policy,hosts,archived) VALUES (?,?,?,?) RETURNING id',$values);
                } elseif (!$db->executeStatement('UPDATE virtual_class_config SET name=?,policy=?,hosts=?,archived=?,
                    deleted_at=CASE WHEN ? THEN COALESCE(deleted_at,CURRENT_TIMESTAMP) END WHERE id=?',[...$values,$values[3],$id])) {
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

    /** @return list<int> */
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
