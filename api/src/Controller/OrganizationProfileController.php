<?php

namespace App\Controller;

use App\Entity\Organization;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\{File\UploadedFile, JsonResponse, Request, Response, ResponseHeaderBag};
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/api/organization-profiles')]
#[IsGranted('ROLE_ADMIN')]
final class OrganizationProfileController extends AbstractController
{
    private const FIELDS = [
        'acronym'=>40,'numberFormationDPC'=>50,'phone'=>30,'address'=>255,'zipCode'=>15,'city'=>100,
        'numberAPE'=>15,'numberTVA'=>40,'footer'=>1000,'email'=>180,'responsible'=>150,'responsibleQuality'=>150,
        'legalForm'=>80,'addressExtra'=>255,'responsibleRole'=>120,'billingName'=>180,'billingAddress'=>255,
        'billingZip'=>15,'billingCity'=>100,'billingEmail'=>180,'billingPhone'=>30,'paymentTerms'=>80,
        'replyEmail'=>180,'contactName'=>150,'contactPhone'=>30,'operational'=>1,'news'=>1,'alerts'=>1,
        'url'=>255,'iban'=>50,'bic'=>20,'tva'=>10,
    ];
    private const KINDS = ['logo','signature','stamp','kbis','qualiopi','rib','declaration'];

    #[Route('/{id}', requirements: ['id'=>'\d+'], methods: ['GET'])]
    public function detail(Organization $organization, EntityManagerInterface $em): JsonResponse
    {
        $db=$em->getConnection();
        $id=$organization->getId();
        $details=$db->fetchOne('SELECT details FROM organization_profile WHERE organization_id=?',[$id]);
        return $this->json([
            'organization'=>['id'=>$id,'name'=>$organization->name,'code'=>$organization->code,'emailFrom'=>$organization->emailFrom,
                'smsSender'=>$organization->smsSender,'siret'=>$organization->siret,'andpcNumber'=>$organization->andpcNumber,
                'active'=>$organization->active,'color'=>$organization->color],
            'details'=>$details ? (object) array_intersect_key(json_decode($details,true,512,JSON_THROW_ON_ERROR),self::FIELDS+['hasTva'=>true]) : new \stdClass(),
            'documents'=>$db->fetchAllAssociative("SELECT kind,name,mime,octet_length(decode(content,'base64')) AS size FROM organization_document WHERE organization_id=? ORDER BY kind",[$id]),
        ],200,['Cache-Control'=>'private, no-store']);
    }

    #[Route('', methods: ['POST'])]
    #[Route('/{id}', requirements: ['id'=>'\d+'], methods: ['POST'])]
    public function save(Request $request, EntityManagerInterface $em, ValidatorInterface $validator, ?int $id=null): JsonResponse
    {
        $organization=$id===null ? null : $em->find(Organization::class,$id);
        if ($id!==null && !$organization) {
            throw $this->createNotFoundException();
        }
        if (!$request->request->has('name') && $request->headers->has('content-length')) {
            return $this->json(['detail'=>'Le formulaire est vide ou dépasse la taille autorisée.'],422);
        }
        $details=[];
        foreach (self::FIELDS as $field=>$max) {
            $value=trim($request->request->getString($field));
            if (mb_strlen($value)>$max) {
                return $this->json(['detail'=>'Un champ dépasse la longueur autorisée.'],422);
            }
            if ($request->request->has($field)) {
                $details[$field]=$value;
            }
        }
        if ((!empty($details['email']) && !filter_var($details['email'],FILTER_VALIDATE_EMAIL)) ||
            (!empty($details['url']) && (!filter_var($details['url'],FILTER_VALIDATE_URL) || !in_array(parse_url($details['url'],PHP_URL_SCHEME),['http','https'],true))) ||
            (($details['tva']??'')!=='' && (!is_numeric($details['tva']) || (float)$details['tva']<0 || (float)$details['tva']>100))) {
            return $this->json(['detail'=>'Vérifiez l’adresse e-mail, le site web et le taux de TVA.'],422);
        }
        $details['hasTva']=$request->request->getBoolean('hasTva');
        $removed=$request->request->all('removedDocuments');
        foreach ($removed as $kind) {
            if (!in_array($kind,self::KINDS,true)) {
                return $this->json(['detail'=>'Type de document inconnu.'],422);
            }
        }
        $files=[];
        foreach ($request->files->all() as $kind=>$file) {
            if (!in_array($kind,self::KINDS,true) || !$file instanceof UploadedFile || !$file->isValid() || !$file->getSize() || $file->getSize()>5*1024*1024) {
                return $this->json(['detail'=>'Chaque document doit peser au maximum 5 Mo.'],422);
            }
            $mime=$file->getMimeType();
            $allowed=in_array($kind,['logo','signature','stamp'],true)?['image/png','image/jpeg','image/webp']:['application/pdf','image/png','image/jpeg','image/webp'];
            if (!in_array($mime,$allowed,true)) {
                return $this->json(['detail'=>'Utilisez PNG, JPEG ou WebP pour les visuels, ou PDF pour les justificatifs.'],422);
            }
            $files[$kind]=[mb_substr($file->getClientOriginalName(),0,255),$mime,base64_encode($file->getContent())];
        }

        $creating=$organization===null;
        $organization ??= new Organization('','','');
        $organization->name=trim($request->request->getString('name'));
        if ($creating) {
            $organization->code=trim($request->request->getString('code'));
        }
        $organization->emailFrom=trim($request->request->getString('emailFrom'));
        foreach (['smsSender','siret','andpcNumber','color'] as $field) {
            $organization->$field=trim($request->request->getString($field)) ?: null;
        }
        $organization->active=$request->request->getBoolean('active');
        $violations=$validator->validate($organization);
        if (count($violations)) {
            return $this->json(['detail'=>$violations[0]->getMessage()],422);
        }

        try {
            $em->wrapInTransaction(static function(EntityManagerInterface $em) use ($organization,$details,$files,$removed): void {
                $em->persist($organization);
                $em->flush();
                $id=$organization->getId();
                $db=$em->getConnection();
                $db->executeStatement('INSERT INTO organization_profile(organization_id,details) VALUES (?,?) ON CONFLICT (organization_id) DO UPDATE SET details=organization_profile.details || excluded.details',
                    [$id,json_encode($details,JSON_THROW_ON_ERROR)]);
                foreach ($removed as $kind) {
                    $db->executeStatement('DELETE FROM organization_document WHERE organization_id=? AND kind=?',[$id,$kind]);
                }
                foreach ($files as $kind=>$file) {
                    $db->executeStatement('INSERT INTO organization_document(organization_id,kind,name,mime,content) VALUES (?,?,?,?,?)
                        ON CONFLICT (organization_id,kind) DO UPDATE SET name=excluded.name,mime=excluded.mime,content=excluded.content',
                        [$id,$kind,...$file]);
                }
            });
        } catch (UniqueConstraintViolationException) {
            return $this->json(['detail'=>'Ce code organisme est déjà utilisé.'],409);
        }
        return $this->json(['id'=>$organization->getId()],$creating?201:200);
    }

    #[Route('/{id}/documents/{kind}', requirements: ['id'=>'\d+'], methods: ['GET'])]
    public function download(Organization $organization,string $kind,EntityManagerInterface $em): Response
    {
        $row=$em->getConnection()->fetchAssociative('SELECT name,mime,content FROM organization_document WHERE organization_id=? AND kind=?',
            [$organization->getId(),$kind]);
        if (!$row) {
            throw $this->createNotFoundException();
        }
        $response=new Response(base64_decode($row['content']),200,['Content-Type'=>$row['mime'],
            'Cache-Control'=>'private, no-store','X-Content-Type-Options'=>'nosniff']);
        $name=str_replace(['/',"\\","\r","\n"],'_',$row['name']);
        $response->headers->set('Content-Disposition',$response->headers->makeDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT,$name,'document'));
        return $response;
    }
}
