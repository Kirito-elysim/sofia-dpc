<?php

namespace App\Tests\Functional;

use App\Entity\AuditLog;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

class ReferentialsTest extends WebTestCase
{
    private KernelBrowser $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->em()->getConnection()->executeStatement('TRUNCATE audit_log, enrollment, trainer, time_slot, participant, virtual_class, formation, organization, "user" RESTART IDENTITY CASCADE');
    }

    private function em(): EntityManagerInterface
    {
        return static::getContainer()->get(EntityManagerInterface::class);
    }

    private function loginAs(string $role, ?string $email = null): User
    {
        $u = new User($email ?? "$role@example.test", 'Test', 'x', ["ROLE_$role"]);
        $this->em()->persist($u);
        $this->em()->flush();
        $this->client->loginUser($u);

        return $u;
    }

    /**
     * @param array<string, mixed> $body
     *
     * @return array<mixed> a record or a list
     */
    private function call(string $method, string $uri, array $body = []): array
    {
        $this->client->request($method, $uri, [], [], [
            'CONTENT_TYPE' => 'PATCH' === $method ? 'application/merge-patch+json' : 'application/json',
            'HTTP_ACCEPT' => 'application/json',
        ], $body ? json_encode($body) : null);

        return json_decode($this->client->getResponse()->getContent() ?: '[]', true) ?? [];
    }

    private function org(): int
    {
        return $this->call('POST', '/api/organizations', ['name' => 'SOFIA', 'code' => 'SOFIA', 'emailFrom' => 's@example.test', 'siret' => '12345678901234'])['id'];
    }

    public function testOrganizationProfileAndPrivateDocument(): void
    {
        $this->loginAs('SUPER_ADMIN', 'owner@example.test');
        $file=tempnam(sys_get_temp_dir(),'sofia-org-');
        file_put_contents($file,"%PDF-1.4\n%%EOF\n");
        try {
            $this->client->request('POST','/api/organization-profiles',[
                'name'=>'Organisme documentation','code'=>'DOC_TEST','emailFrom'=>'doc@example.test',
                'active'=>'1','iban'=>'FR test','responsibleQuality'=>'Camille','isInstitution'=>'1',
            ],['qualiopi'=>new \Symfony\Component\HttpFoundation\File\UploadedFile($file,'certificat.pdf',null,null,true)]);
            self::assertResponseStatusCodeSame(201);
            $id=json_decode($this->client->getResponse()->getContent(),true)['id'];
            $url='/api/organization-profiles/'.$id;
            $profile=$this->call('GET',$url);
            self::assertSame('Camille',$profile['details']['responsibleQuality']);
            self::assertSame('certificat.pdf',$profile['documents'][0]['name']);
            $this->client->request('GET',$url.'/documents/qualiopi');
            self::assertResponseIsSuccessful();
            self::assertSame('application/pdf',$this->client->getResponse()->headers->get('Content-Type'));
            self::assertArrayNotHasKey('isInstitution',$profile['details']);
            self::assertContains($id,array_column($this->call('GET','/api/organizations'),'id'));
            $this->client->request('POST',$url,[
                'name'=>'Organisme documentation modifié','emailFrom'=>'doc@example.test','active'=>'1',
                'responsibleQuality'=>'Lou','isInstitution'=>'1',
            ]);
            self::assertResponseIsSuccessful();
            $updated=$this->call('GET',$url);
            self::assertSame('Organisme documentation modifié',$updated['organization']['name']);
            self::assertSame('Lou',$updated['details']['responsibleQuality']);
            self::assertArrayNotHasKey('isInstitution',$updated['details']);
            self::assertSame('certificat.pdf',$updated['documents'][0]['name']);
            $reader = $this->loginAs('LECTURE');
            $reader->addOrganization($this->em()->find(\App\Entity\Organization::class, $id));
            $this->em()->flush();
            $this->call('GET',$url.'/documents/qualiopi');
            self::assertResponseStatusCodeSame(403);
            $public=$this->call('GET','/api/organizations/'.$id);
            self::assertArrayNotHasKey('iban',$public);
            $this->loginAs('SUPER_ADMIN');
            self::assertSame(filesize($file),(int)$profile['documents'][0]['size']);
            $this->client->request('POST',$url,[
                'name'=>'Organisme documentation modifié','emailFrom'=>'doc@example.test','active'=>'1',
                'removedDocuments'=>['qualiopi'],
            ]);
            self::assertResponseIsSuccessful();
            self::assertSame([],$this->call('GET',$url)['documents']);
            $db = $this->em()->getConnection();
            self::assertIsString($db->fetchOne("SELECT deleted_at FROM organization_document WHERE organization_id=? AND kind='qualiopi'", [$id]));
            $this->call('GET',$url.'/documents/qualiopi');
            self::assertResponseStatusCodeSame(404);
            $this->call('DELETE','/api/organizations/'.$id);
            self::assertResponseStatusCodeSame(204);
            self::assertNotContains($id,array_column($this->call('GET','/api/organizations'),'id'));
            self::assertNotContains($id,array_map('intval',array_column($this->call('GET','/api/organization-summaries'),'id')));
            self::assertIsString($db->fetchOne('SELECT deleted_at FROM organization WHERE id=?', [$id]));
            $this->call('GET',$url);
            self::assertResponseStatusCodeSame(404);
            $this->call('GET','/api/organizations/'.$id);
            self::assertResponseStatusCodeSame(404);
            $this->call('GET',$url.'/documents/qualiopi');
            self::assertResponseStatusCodeSame(404);
        } finally {
            unlink($file);
        }
    }

    public function testOrganizationDraftIsPrivateAndClosesOnlyAfterCreation(): void
    {
        $owner = $this->loginAs('SUPER_ADMIN', 'owner@example.test');
        $base = '/api/organization-profiles';
        $this->client->request('POST', "$base/drafts", ['step'=>'2', 'name'=>'Brouillon']);
        self::assertResponseStatusCodeSame(201);
        $id = json_decode($this->client->getResponse()->getContent(), true)['id'];
        $url = "$base/drafts/$id";

        $this->loginAs('SUPER_ADMIN');
        self::assertSame([], $this->call('GET', "$base/drafts"));
        $this->call('GET', $url);
        self::assertResponseStatusCodeSame(404);
        $this->client->request('POST', $url, ['step'=>'0', 'name'=>'Autre']);
        self::assertResponseStatusCodeSame(404);
        $this->call('DELETE', $url);
        self::assertResponseStatusCodeSame(404);
        $this->client->request('POST', $base, [
            'draftId'=>$id, 'name'=>'Autre', 'code'=>'OTHER', 'emailFrom'=>'other@example.test',
        ]);
        self::assertResponseStatusCodeSame(404);

        $this->client->loginUser($this->em()->find(User::class, $owner->getId()));
        self::assertSame('Brouillon', $this->call('GET', $url)['values']['name']);
        $this->client->request('POST', $base, ['draftId'=>$id, 'name'=>'Brouillon']);
        self::assertResponseStatusCodeSame(422);
        self::assertSame(2, $this->call('GET', $url)['step']);
        $this->client->request('POST', $base, [
            'draftId'=>$id, 'name'=>'Brouillon finalisé', 'code'=>'DRAFT', 'emailFrom'=>'draft@example.test',
        ]);
        self::assertResponseStatusCodeSame(201);
        $this->call('GET', $url);
        self::assertResponseStatusCodeSame(404);
        self::assertSame([], $this->call('GET', "$base/drafts"));
    }

    public function testOrganizationCrudRolesValidationAndAudit(): void
    {
        $this->loginAs('LECTURE');
        $this->call('POST', '/api/organizations', ['name' => 'X', 'code' => 'X1', 'emailFrom' => 'x@example.test']);
        $this->assertResponseStatusCodeSame(403);

        $this->loginAs('SUPER_ADMIN');
        $id = $this->org();
        $this->assertResponseStatusCodeSame(201);

        $this->call('POST', '/api/organizations', ['name' => 'Dup', 'code' => 'SOFIA', 'emailFrom' => 'd@example.test']);
        $this->assertResponseStatusCodeSame(422);
        $this->call('POST', '/api/organizations', ['name' => 'Bad', 'code' => 'BAD', 'emailFrom' => 'b@example.test', 'siret' => '123']);
        $this->assertResponseStatusCodeSame(422);

        $this->call('PATCH', "/api/organizations/$id", ['active' => false]);
        $this->assertResponseIsSuccessful();
        $this->assertFalse($this->call('GET', "/api/organizations/$id")['active']);

        $actions = array_map(fn (AuditLog $a) => $a->action.':'.$a->entity, $this->em()->getRepository(AuditLog::class)->findBy([], ['id' => 'ASC']));
        $this->assertContains('CREATE:Organization', $actions);
        $this->assertContains('UPDATE:Organization', $actions);
        $this->assertContains('REQUEST_FAILED:organizations', $actions);
    }

    public function testAuditKeepsPayloadAndDeletedContentWithoutSecrets(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $id = $this->call('POST', '/api/target-audiences', ['name' => 'Médecins', 'acronym' => 'MED'])['id'];
        $this->call('DELETE', "/api/target-audiences/$id");
        $this->call('POST', '/api/users', ['email' => 'p@example.test', 'name' => 'P', 'role' => 'ROLE_SUIVI', 'plainPassword' => 'un-mot-de-passe-long']);
        $this->call('POST', '/api/auth/logout');

        $entries = $this->em()->getRepository(AuditLog::class)->findBy([], ['id' => 'ASC']);
        $find = static fn (string $key): AuditLog => current(array_filter($entries, static fn (AuditLog $a) => $a->action.':'.$a->entity === $key)) ?: throw new \LogicException($key);
        $created = $find('CREATE:TargetAudience');
        $this->assertSame('MED', (($created->request ?? [])['payload'] ?? [])['acronym'] ?? null);
        $deleted = $find('DELETE:TargetAudience');
        $this->assertSame('Médecins', $deleted->label);
        $this->assertSame(['MED', null], $deleted->data['acronym']);
        $this->assertStringNotContainsString('un-mot-de-passe-long', (string) json_encode(array_map(static fn (AuditLog $a) => [$a->data, $a->request], $entries)));
        $find('LOGOUT:auth');

        // Many-to-many links are traced once, with what they were and what they became.
        $this->client->loginUser($this->em()->getRepository(User::class)->findOneBy(['email' => 'SUPER_ADMIN@example.test']) ?? throw new \LogicException());
        $org = $this->org();
        $other = $this->call('POST', '/api/organizations', ['name' => 'Autre', 'code' => 'AUTRE', 'emailFrom' => 'autre@example.test', 'siret' => '12345678901235'])['id'];
        $formation = $this->call('POST', '/api/formations', ['title' => 'Liens', 'organization' => "/api/organizations/$org", 'additionalOrganizations' => ["/api/organizations/$other"]])['id'];
        $this->call('PATCH', "/api/formations/$formation", ['additionalOrganizations' => []]);
        $this->call('PATCH', "/api/formations/$formation", ['publicationStatus' => 'archived']);
        $rows = $this->em()->getRepository(AuditLog::class)->findBy(['entity' => 'Formation', 'entityId' => $formation], ['id' => 'ASC']);
        $this->assertSame(['CREATE', 'UPDATE', 'ARCHIVE'], array_map(static fn (AuditLog $a) => $a->action, $rows));
        $this->assertSame([[['id' => $other, 'label' => 'Autre']], []], $rows[1]->data['additionalOrganizations']);

        $this->loginAs('ADMIN');
        $this->call('GET', '/api/audit/'.$deleted->getId());
        $this->assertResponseStatusCodeSame(403);
    }

    public function testScheduleBlocksOverlapAndKeepsOneClassForTwoSlots(): void
    {
        $this->em()->getConnection()->executeStatement('TRUNCATE zoom_account CASCADE');
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $formation = $this->call('POST', '/api/formations', ['publicationStatus' => 'published', 'title' => 'Test Zoom', 'organization' => "/api/organizations/$org"])['id'];
        $trainer = $this->call('POST', '/api/trainers', ['firstName' => 'Test', 'lastName' => 'Zoom', 'email' => 'trainer@example.test', 'organizations' => ["/api/organizations/$org"]])['id'];
        $slots = [];
        foreach ([['Matin', '09:00', '13:00'], ['Après-midi', '14:00', '17:00']] as [$label, $startTime, $endTime]) {
            $slots[] = ['trainerId' => $trainer, 'timeSlotId' => $this->call('POST', '/api/time-slots', compact('label', 'startTime', 'endTime'))['id']];
        }
        $body = ['date' => '2030-06-03', 'formationId' => $formation, 'dpcAction' => '001', 'dpcSession' => '002', 'slots' => $slots];
        $this->assertSame('NO_ZOOM_ACCOUNT_AVAILABLE', $this->call('POST', '/api/scheduled-classes', $body)['code']);
        $this->assertResponseStatusCodeSame(409);
        $this->call('POST', '/api/zoom-accounts', ['label' => 'Zoom 1', 'profile' => 'DEMO', 'hostUserId' => 'test-host']);
        $this->assertResponseStatusCodeSame(201);
        $key = '6ce6e36c-4cb7-471a-a909-305643207f73';
        $headers = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_IDEMPOTENCY_KEY' => $key];
        $this->client->request('POST', '/api/scheduled-classes', [], [], $headers, json_encode($body));
        $this->assertResponseStatusCodeSame(201);
        $this->client->request('POST', '/api/scheduled-classes', [], [], $headers, json_encode($body));
        $this->assertResponseStatusCodeSame(200);
        $this->call('POST', '/api/scheduled-classes', $body);
        $this->assertResponseStatusCodeSame(409);
        $this->assertCount(1, $this->call('GET', '/api/virtual-classes'));
        $this->assertSame(2, (int) $this->em()->getConnection()->fetchOne("SELECT count(*) FROM class_slot WHERE zoom_state='pending'"));
        $calendar = $this->call('GET', '/api/planning');
        $this->assertCount(2, $calendar['slots']);
        $this->assertSame($calendar['slots'][0]['classId'], $calendar['slots'][1]['classId']);
        $this->assertSame('09:00', $calendar['slots'][0]['startTime']);
        $this->assertSame('pending', $calendar['slots'][0]['zoomState']);
        $this->call('POST', '/api/zoom-accounts', ['label' => 'Zoom 2', 'profile' => 'SECOND', 'hostUserId' => 'other-host']);
        $this->assertResponseStatusCodeSame(201);
        $otherTrainer = $this->call('POST', '/api/trainers', ['firstName' => 'Autre', 'lastName' => 'Test', 'email' => 'second@example.test', 'organizations' => ["/api/organizations/$org"]])['id'];
        foreach ($body['slots'] as $index => $slot) {
            $body['slots'][$index]['trainerId'] = $otherTrainer;
        }
        $this->call('POST', '/api/scheduled-classes', $body);
        $this->assertResponseStatusCodeSame(201);
        $calendar = $this->call('GET', '/api/planning');
        $this->assertSame(['Zoom 1', 'Zoom 2'], $calendar['accounts']);
        $this->assertSame(['Zoom 1', 'Zoom 2'], array_column(array_filter($calendar['slots'], static fn ($s) => '09:00' === $s['startTime']), 'zoom'));
        $this->call('POST', '/api/scheduled-classes', $body);
        $this->assertResponseStatusCodeSame(409);

    }

    public function testWorkerAssignsPersonalLinksOnlyToLearners(): void
    {
        $this->em()->getConnection()->executeStatement('TRUNCATE zoom_account CASCADE');
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $formation = $this->call('POST', '/api/formations', ['publicationStatus' => 'published', 'title' => 'Atelier', 'organization' => "/api/organizations/$org"])['id'];
        $trainer = $this->call('POST', '/api/trainers', ['firstName' => 'Ana', 'lastName' => 'Test', 'email' => 'ana@example.test', 'organizations' => ["/api/organizations/$org"]])['id'];
        $time = $this->call('POST', '/api/time-slots', ['label' => 'Matin', 'startTime' => '09:00', 'endTime' => '13:00'])['id'];
        $host = $this->call('POST', '/api/zoom-accounts', ['label' => 'Compte test', 'profile' => 'DEMO', 'hostUserId' => 'test'])['id'];
        $configPayload=['name'=>'Politique organisme','hosts'=>[$host],'organizations'=>[$org],
            'policy'=>['waitingRoom'=>false,'passcode'=>false,'joinBeforeHost'=>true,'recording'=>'none']];
        $this->call('POST','/api/virtual-class-configs',$configPayload);
        self::assertResponseStatusCodeSame(422);
        $configPayload['policy']['passcode']=true;
        $config=$this->call('POST','/api/virtual-class-configs',$configPayload);
        self::assertResponseIsSuccessful();
        $class = $this->call('POST', '/api/scheduled-classes', ['date' => '2030-06-03','formationId' => $formation,'dpcAction' => 'A','dpcSession' => 'S','slots' => [['timeSlotId' => $time,'trainerId' => $trainer]]])['id'];
        $this->call('POST','/api/virtual-class-configs',[...$configPayload,'id'=>$config['id'],'policy'=>['waitingRoom'=>true,
            'passcode'=>false,'joinBeforeHost'=>false,'recording'=>'account_default']]);
        self::assertResponseIsSuccessful();
        foreach (['alice','paul'] as $first) {
            $this->call('POST',"/api/virtual-classes/$class/enrollments",['firstName'=>$first,'lastName'=>'Test','email'=>$first.'@example.test']);
            self::assertResponseStatusCodeSame(201);
        }
        $this->call('POST',"/api/virtual-classes/$class/enrollments",['firstName'=>'Ana','lastName'=>'Test','email'=>'ana@example.test']);
        self::assertResponseStatusCodeSame(409);
        $http=new \Symfony\Component\HttpClient\MockHttpClient(static function(string $method,string $url,array $options) {
            if (str_ends_with($url,'/oauth/token')) { $response=['access_token'=>'local-token']; }
            elseif (str_ends_with($url,'/meetings')) {
                self::assertTrue(json_decode($options['body'],true)['settings']['registrants_confirmation_email']);
                $body=json_decode($options['body'],true);
                self::assertMatchesRegularExpression('/^\d{6}$/',$body['password']);
                self::assertFalse($body['settings']['waiting_room']);
                self::assertTrue($body['settings']['join_before_host']);
                self::assertSame('none',$body['settings']['auto_recording']);
                self::assertSame(0,$body['settings']['approval_type']);
                $response=['id'=>'12345678901','password'=>'','settings'=>['waiting_room'=>true,'join_before_host'=>false,'auto_recording'=>'none','approval_type'=>0]];
            } else {
                self::assertSame('POST',$method);
                self::assertStringEndsWith('/meetings/12345678901/registrants',$url);
                $email=json_decode($options['body'],true)['email'];
                self::assertContains($email,['alice@example.test','paul@example.test']);
                $key=hash('sha256',$email);
                $response=['registrant_id'=>$key,'join_url'=>'https://example.test/j/'.$key];
            }
            return new \Symfony\Component\HttpClient\Response\MockResponse(json_encode($response,JSON_THROW_ON_ERROR));
        });
        $gateway=new \App\Zoom\ZoomGateway($http,['DEMO'=>['account_id'=>'test','client_id'=>'test','client_secret'=>'test']],new \Symfony\Component\Cache\Adapter\ArrayAdapter());
        $provision=new \Symfony\Component\Console\Tester\CommandTester(new \App\Command\ProvisionZoomCommand($this->em(),$gateway));
        self::assertSame(0,$provision->execute([]));
        $sync=new \Symfony\Component\Console\Tester\CommandTester(new \App\Command\ZoomRegistrationsCommand($this->em(),$gateway));
        self::assertSame(0,$sync->execute([]));
        self::assertSame(0,$sync->execute([]));
        self::assertSame(4,$http->getRequestsCount());
        $list=$this->call('GET',"/api/virtual-classes/$class/enrollments");
        self::assertStringContainsString('Ana',$list['teachingSlots'][0]['trainer']);
        self::assertFalse($list['teachingSlots'][0]['policy']['requested']['waitingRoom']);
        self::assertTrue($list['teachingSlots'][0]['policy']['effective']['waitingRoom']);
        self::assertCount(2,$list['zoomRegistrations']);
        $links=array_column($list['zoomRegistrations'],'url','enrollment');
        foreach ($list['enrollments'] as $row) {
            self::assertSame('https://example.test/j/'.hash('sha256',$row['participant']['email']),$links[$row['id']]);
        }
        self::assertCount(2,array_unique($links));
    }

    public function testZoomPresenceSignatureRoleAndDuplicateDelivery(): void
    {
        $this->em()->getConnection()->executeStatement('TRUNCATE zoom_account CASCADE');
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $formation = $this->call('POST', '/api/formations', ['publicationStatus' => 'published', 'title' => 'Atelier', 'organization' => "/api/organizations/$org"])['id'];
        $trainer = $this->call('POST', '/api/trainers', ['firstName' => 'Ana', 'lastName' => 'Test', 'email' => 'ana@example.test', 'organizations' => ["/api/organizations/$org"]])['id'];
        $time = $this->call('POST', '/api/time-slots', ['label' => 'Matin', 'startTime' => '09:00', 'endTime' => '13:00'])['id'];
        $host = $this->call('POST', '/api/zoom-accounts', ['label' => 'Compte test', 'profile' => 'DEMO', 'hostUserId' => 'test'])['id'];
        $class = $this->call('POST', '/api/scheduled-classes', ['date' => '2030-06-03','formationId' => $formation,'dpcAction' => 'A','dpcSession' => 'S','slots' => [['timeSlotId' => $time,'trainerId' => $trainer]]])['id'];
        $this->em()->getConnection()->executeStatement("UPDATE class_slot SET meeting_number='12345678901' WHERE virtual_class_id=?", [$class]);
        $this->call('POST', "/api/virtual-classes/$class/enrollments", ['firstName' => 'Paul','lastName' => 'Test','email' => 'ps@example.test']);
        $ts = (string) time();
        $registration = function(string $event,int $stamp) use ($host,$ts): void {
            $body=json_encode(['event'=>$event,'event_ts'=>$stamp,'payload'=>['account_id'=>'demo-account',
                'object'=>['id'=>'12345678901','registrant'=>['id'=>'personal-id','email'=>'ps@example.test',
                'status'=>'approved','join_url'=>'https://example.test/j/private']]]],JSON_THROW_ON_ERROR);
            $this->client->request('POST',"/webhooks/zoom/$host",[],[],['CONTENT_TYPE'=>'application/json',
                'HTTP_X_ZM_REQUEST_TIMESTAMP'=>$ts,'HTTP_X_ZM_SIGNATURE'=>'v0='.hash_hmac('sha256',"v0:$ts:$body",'fixture-signing-key')],$body);
            $this->assertResponseStatusCodeSame(204);
        };
        $registration('meeting.registration_created',1000);
        $registration('meeting.registration_created',1000);
        $regs=$this->call('GET',"/api/virtual-classes/$class/enrollments")['zoomRegistrations'];
        self::assertCount(1,$regs);
        self::assertSame('approved',$regs[0]['state']);
        self::assertSame('https://example.test/j/private',$regs[0]['url']);
        foreach (['ana@example.test','ps@example.test',''] as $n => $email) {
            $body = json_encode(['event' => 'meeting.participant_joined','payload' => ['account_id' => 'demo-account','object' => ['id' => '12345678901','uuid' => 'instance','participant' => ['user_id' => (string) ($n+1),'email' => $n===1?'':$email,'registrant_id'=>$n===1?'personal-id':'','join_time' => '2030-06-03T07:02:00Z']]]], JSON_THROW_ON_ERROR);
            $headers = ['CONTENT_TYPE' => 'application/json','HTTP_X_ZM_REQUEST_TIMESTAMP' => $ts,'HTTP_X_ZM_SIGNATURE' => 'invalid'];
            $this->client->request('POST', "/webhooks/zoom/$host", [], [], $headers, $body);
            $this->assertResponseStatusCodeSame(401);
            $headers['HTTP_X_ZM_SIGNATURE'] = 'v0='.hash_hmac('sha256', "v0:$ts:$body", 'fixture-signing-key');
            for ($i=0; $i<2; ++$i) {
                $this->client->request('POST', "/webhooks/zoom/$host", [], [], $headers, $body);
                $this->assertResponseStatusCodeSame(204);
            }
        }
        $events = $this->call('GET', '/api/live-presence');
        $this->assertSame(['UNKNOWN','LEARNER','TRAINER'], array_column($events, 'role'));
        $registration('meeting.registration_cancelled',3000);
        $registration('meeting.registration_approved',2000);
        $reg=$this->call('GET',"/api/virtual-classes/$class/enrollments")['zoomRegistrations'][0];
        self::assertSame('cancelled',$reg['state']);
        self::assertNull($reg['url']);
        $db = $this->em()->getConnection();
        $db->executeStatement("UPDATE class_slot SET starts_at=(now() AT TIME ZONE 'Europe/Paris')-interval '1 hour',
            ends_at=(now() AT TIME ZONE 'Europe/Paris')+interval '1 hour' WHERE virtual_class_id=?", [$class]);
        $db->executeStatement("UPDATE attendance_event SET at=now()-interval '30 minutes' WHERE person_role='LEARNER'");
        // Two overlapping devices, with unidentified leave events received in reverse order.
        $db->executeStatement("INSERT INTO attendance_event(event_key,slot_id,connection_key,at,event,person_role,enrollment_id)
            SELECT fixture.key,a.slot_id,fixture.device,now()-fixture.age,fixture.kind,
                   CASE WHEN fixture.kind='JOIN' THEN 'LEARNER' ELSE 'UNKNOWN' END,
                   CASE WHEN fixture.kind='JOIN' THEN a.enrollment_id END
            FROM attendance_event a CROSS JOIN LATERAL (VALUES
                ('second-leave','second',interval '12 minutes','LEAVE'),
                ('first-leave',a.connection_key,interval '15 minutes','LEAVE'),
                ('second-join','second',interval '20 minutes','JOIN')
            ) fixture(key,device,age,kind) WHERE a.person_role='LEARNER'");
        $summary = $this->call('GET', '/api/live-presence/learners');
        $this->assertResponseIsSuccessful();
        $this->assertCount(1, $summary);
        $this->assertSame('Paul Test', $summary[0]['name']);
        $this->assertSame('DISCONNECTED', $summary[0]['status']);
        $this->assertEqualsWithDelta(1080, $summary[0]['seconds'], 2);
        $this->assertGreaterThanOrEqual(720, $summary[0]['awaySeconds']);
        // Move the slot five minutes into the future and exercise the real scheduling query.
        $db->executeStatement("UPDATE class_slot SET starts_at=(now() AT TIME ZONE 'Europe/Paris')+interval '4 minutes 58 seconds'
            WHERE virtual_class_id=?", [$class]);
        $cards=$this->call('GET','/api/live-presence/classes');
        $this->assertResponseIsSuccessful();
        self::assertCount(1,$cards);
        self::assertSame('Atelier',$cards[0]['title']);
        self::assertFalse($cards[0]['trainerConnected']);
        self::assertSame('left',$cards[0]['participants'][0]['state']);
        self::assertSame('Paul Test',$cards[0]['participants'][0]['name']);
        $this->call('POST','/api/live-presence/classes/'.$cards[0]['id'].'/contact',['target'=>'0','channel'=>'MAIL','body'=>'Test']);
        $this->assertResponseStatusCodeSame(404);
        foreach (['CONNECTED','NOT_CONNECTED'] as $rule) {
            $this->call('POST','/api/message-templates', ['name'=>'Test rappel','channel'=>'E-mail','organization'=>'Tous',
                'triggerLabel'=>'5 min avant','body'=>'Bonjour {prenom}','minutesBefore'=>5,'presenceRule'=>$rule]);
            $this->assertResponseStatusCodeSame(201);
        }
        $mailer = $this->createMock(\Symfony\Component\Mailer\MailerInterface::class);
        $mailer->expects(self::once())->method('send')->with(self::callback(
            static fn ($email) => 'Bonjour Paul' === $email->getTextBody()
        ));
        $command = new \Symfony\Component\Console\Tester\CommandTester(new \App\Command\SendScheduledReminders(
            $db,$mailer,$this->createStub(\Symfony\Component\Notifier\TexterInterface::class)
        ));
        $command->execute([]);
        $command->execute([]);
        self::assertSame('SENT',$db->fetchOne("SELECT status FROM message_log WHERE kind='SCHEDULED_REMINDER'"));
        $db->executeStatement("UPDATE message_template SET active=false WHERE name='Test rappel'");


    }

    public function testMessageTemplateEditingAndPermissions(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $fields = ['name'=>'Relance test','channel'=>'SMS','organization'=>'Tous','triggerLabel'=>'J-3','body'=>'Bonjour {prenom}'];
        $row = $this->call('POST', '/api/message-templates', $fields);
        $this->assertResponseStatusCodeSame(201);
        $url = '/api/message-templates/'.$row['id'];
        $this->call('PATCH', $url, ['body'=>str_repeat('a', 160)]);
        $this->assertResponseStatusCodeSame(422);
        $this->assertFalse($this->call('PATCH', $url, ['active'=>false])['active']);
        $this->loginAs('LECTURE');
        $this->call('GET', '/api/message-templates');
        $this->assertResponseStatusCodeSame(403);
        $this->call('PATCH', $url, ['active'=>true]);
        $this->assertResponseStatusCodeSame(403);
    }

    public function testCustomRoleUsesTheSamePermissionsAcrossAssignedOrganizations(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $first = $this->org();
        $second = $this->call('POST', '/api/organizations', ['name' => 'PHOCEA', 'code' => 'PHO', 'emailFrom' => 'p@example.test'])['id'];
        $outside = $this->call('POST', '/api/organizations', ['name' => 'Autre', 'code' => 'OTHER', 'emailFrom' => 'o@example.test'])['id'];
        $role = $this->call('POST', '/api/custom-roles', ['name' => 'Coordinateur DPC', 'permissions' => ['EDIT_FORMATIONS']]);
        $account = $this->call('POST', '/api/users', [
            'name' => 'Coordination',
            'email' => 'coordinateur@example.test',
            'plainPassword' => 'mot-de-passe-temporaire',
            'role' => 'ROLE_LECTURE',
            'customRoleId' => $role['id'],
            'organizations' => ["/api/organizations/$first", "/api/organizations/$second"],
        ]);
        self::assertResponseStatusCodeSame(201);
        self::assertSame('custom:'.$role['id'], $account['assignedRole']);

        $user = $this->em()->find(User::class, $account['id']);
        $user->mustChangePassword = false;
        $this->em()->flush();
        $this->client->loginUser($user);

        self::assertEqualsCanonicalizing([$first, $second], array_column($this->call('GET', '/api/organizations'), 'id'));
        foreach ([$first, $second] as $organization) {
            $this->call('POST', '/api/formations', ['title' => 'Formation', 'organization' => "/api/organizations/$organization"]);
            self::assertResponseStatusCodeSame(201);
        }
        $this->call('POST', '/api/formations', ['title' => 'Formation hors périmètre', 'organization' => "/api/organizations/$outside"]);
        self::assertResponseStatusCodeSame(400);
        self::assertCount(2, $this->call('GET', '/api/formations'));

        $this->call('GET', '/api/planning');
        self::assertResponseStatusCodeSame(403);
        $this->call('GET', '/api/custom-roles');
        self::assertResponseStatusCodeSame(403);
    }

    public function testFormationTrainerTimeSlot(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $t = $this->call('POST', '/api/formations', ['organization' => "/api/organizations/$org", 'title' => 'Formation fictive', 'defaultCapacity' => 20]);
        $this->assertResponseStatusCodeSame(201);

        $tr = $this->call('POST', '/api/trainers', ['firstName' => 'Jean', 'lastName' => 'Test', 'email' => 'j@example.test', 'organizations' => ["/api/organizations/$org"]]);
        $this->assertResponseStatusCodeSame(201);
        $this->assertCount(1, $tr['organizations']);

        $slot = $this->call('POST', '/api/time-slots', ['label' => 'Matin', 'startTime' => '09:00', 'endTime' => '13:00']);
        $this->assertSame(240, $slot['durationMin']);
        $this->call('POST', '/api/time-slots', ['label' => 'KO', 'startTime' => '13:00', 'endTime' => '09:00']);
        $this->assertResponseStatusCodeSame(422);

        $this->call('DELETE', "/api/organizations/$org");
        $this->assertResponseStatusCodeSame(204);
        $this->assertCount(1, $this->call('GET', "/api/trainers/{$tr['id']}")['organizations']);

        foreach (['formations' => $t['id'], 'trainers' => $tr['id'], 'time-slots' => $slot['id']] as $resource => $id) {
            $this->call('DELETE', "/api/$resource/$id");
            $this->assertResponseStatusCodeSame(204);
            $this->assertNotContains($id, array_column($this->call('GET', "/api/$resource"), 'id'));
        }
        $db = $this->em()->getConnection();
        $this->assertIsString($db->fetchOne('SELECT deleted_at FROM formation WHERE id=? AND organization_id=?', [$t['id'], $org]));
        $this->assertSame('DELETE', $db->fetchOne("SELECT action FROM audit_log WHERE entity='Organization' AND entity_id=? ORDER BY id DESC LIMIT 1", [$org]));
    }

    public function testUsersAreSuperAdminOnlyHashedAndDeactivable(): void
    {
        $this->loginAs('ADMIN');
        $this->call('GET', '/api/users');
        $this->assertResponseStatusCodeSame(403);

        $me = $this->loginAs('SUPER_ADMIN');
        $this->call('POST', '/api/users', ['email' => 'n@example.test', 'name' => 'Nouveau', 'role' => 'ROLE_SUIVI', 'plainPassword' => 'court']);
        $this->assertResponseStatusCodeSame(422);
        $u = $this->call('POST', '/api/users', ['email' => 'n@example.test', 'name' => 'Nouveau', 'role' => 'ROLE_SUIVI', 'plainPassword' => 'un-mot-de-passe-long']);
        $this->assertResponseStatusCodeSame(201);
        $this->assertArrayNotHasKey('password', $u);
        $this->assertArrayNotHasKey('plainPassword', $u);
        $this->assertSame('ROLE_SUIVI', $u['role']);

        $stored = $this->em()->getRepository(User::class)->find($u['id']);
        $this->assertTrue(static::getContainer()->get(UserPasswordHasherInterface::class)->isPasswordValid($stored, 'un-mot-de-passe-long'));

        $this->call('PATCH', "/api/users/{$me->getId()}", ['active' => false]);
        $this->assertResponseStatusCodeSame(422);

        $this->call('PATCH', "/api/users/{$u['id']}", ['active' => false]);
        $this->assertResponseIsSuccessful();
        $this->client->getCookieJar()->clear(); // drop the test login, try real credentials
        $this->client->jsonRequest('POST', '/api/auth/login', ['username' => 'n@example.test', 'password' => 'un-mot-de-passe-long']);
        $this->assertSame(401, $this->client->getResponse()->getStatusCode());
        $this->em()->getRepository(User::class)->find($u['id'])->active = true;
        $this->em()->flush();
        $this->client->jsonRequest('POST', '/api/auth/login', ['username' => 'n@example.test', 'password' => 'un-mot-de-passe-long']);
        $this->assertSame(200, $this->client->getResponse()->getStatusCode());
        $actions = $this->em()->getConnection()->fetchFirstColumn("SELECT action FROM audit_log WHERE user_email='n@example.test'");
        $this->assertContains('LOGIN_FAILURE', $actions);
    }

    public function testTrainerAccountSeesOnlyOwnUpcomingClasses(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $train = $this->call('POST', '/api/formations', ['organization' => "/api/organizations/$org", 'title' => 'Formation', 'defaultCapacity' => 20]);
        $mine = $this->call('POST', '/api/trainers', ['firstName' => 'A', 'lastName' => 'B', 'email' => 'a@example.test']);
        $other = $this->call('POST', '/api/trainers', ['firstName' => 'C', 'lastName' => 'D', 'email' => 'c@example.test']);

        // A FORMATEUR account needs a trainer.
        $this->call('POST', '/api/users', ['email' => 'f@example.test', 'name' => 'F', 'role' => 'ROLE_FORMATEUR', 'plainPassword' => 'un-mot-de-passe-long']);
        $this->assertResponseStatusCodeSame(422);
        $u = $this->call('POST', '/api/users', ['email' => 'f@example.test', 'name' => 'F', 'role' => 'ROLE_FORMATEUR', 'trainer' => "/api/trainers/{$mine['id']}", 'plainPassword' => 'un-mot-de-passe-long']);
        $this->assertResponseStatusCodeSame(201);

        $em = $this->em();
        $t = $em->getRepository(\App\Entity\Formation::class)->find($train['id']);
        $slot = new \App\Entity\TimeSlot('Matin', '09:00', '13:00');
        $em->persist($slot);
        $future = new \App\Entity\VirtualClass($t, new \DateTimeImmutable('+3 days'));
        $past = new \App\Entity\VirtualClass($t, new \DateTimeImmutable('-3 days'));
        $others = new \App\Entity\VirtualClass($t, new \DateTimeImmutable('+4 days'));
        foreach ([$future, $past, $others] as $c) {
            $em->persist($c);
        }
        $em->persist(new \App\Entity\ClassSlot($future, $slot, $em->getRepository(\App\Entity\Trainer::class)->find($mine['id'])));
        $em->persist(new \App\Entity\ClassSlot($past, $slot, $em->getRepository(\App\Entity\Trainer::class)->find($mine['id'])));
        $em->persist(new \App\Entity\ClassSlot($others, $slot, $em->getRepository(\App\Entity\Trainer::class)->find($other['id'])));
        $em->flush();

        $trainerAccount = $em->getRepository(User::class)->find($u['id']);
        $trainerAccount->mustChangePassword = false;
        $em->flush();
        $this->client->loginUser($trainerAccount);
        $rows = $this->call('GET', '/api/me/classes');
        $this->assertResponseIsSuccessful();
        $this->assertCount(1, $rows);
        $this->assertSame('Matin', current($rows)['slot'] ?? null);
        $this->call('GET', '/api/organizations'); // staff API stays closed to trainers
        $this->assertResponseStatusCodeSame(403);

        $this->loginAs('SUIVI');
        $this->call('GET', '/api/me/classes');
        $this->assertResponseStatusCodeSame(403);
    }

    public function testTrainerAccessIsManagedFromTheTrainerSheet(): void
    {
        $owner = $this->loginAs('SUPER_ADMIN');
        $mine = $this->call('POST', '/api/trainers', ['firstName' => 'Ana', 'lastName' => 'Test', 'email' => 'ana@example.test']);
        $this->assertSame('created', $this->call('POST', "/api/trainers/{$mine['id']}/access")['result']);
        $this->assertEmailCount(1);
        $account = fn () => $this->em()->getRepository(User::class)->findOneBy(['trainer' => $mine['id']]);
        $this->assertSame('ROLE_FORMATEUR', $account()->getRole());
        $this->assertTrue($account()->mustChangePassword);

        $this->call('PATCH', "/api/trainers/{$mine['id']}", ['email' => 'ana.new@example.test']);
        $this->assertSame('ana.new@example.test', $account()->email);
        $this->call('PATCH', "/api/trainers/{$mine['id']}/access", ['active' => false]);
        $this->assertFalse($account()->canLogin());
        $this->call('PATCH', "/api/trainers/{$mine['id']}/access", ['active' => true]);
        $this->call('PATCH', "/api/trainers/{$mine['id']}", ['active' => false]);
        $this->assertFalse($account()->canLogin());

        // Same e-mail as a staff account: linked, role and password untouched, access follows the sheet.
        $admin = $this->loginAs('ADMIN', 'boss@example.test');
        $adminId = $admin->getId();
        $this->client->loginUser($this->em()->getRepository(User::class)->find($owner->getId()));
        $boss = $this->call('POST', '/api/trainers', ['firstName' => 'Bo', 'lastName' => 'Test', 'email' => 'Boss@example.test']);
        $this->assertSame('linked', $this->call('POST', "/api/trainers/{$boss['id']}/access")['result']);
        $this->call('POST', "/api/trainers/{$boss['id']}/access");
        $this->assertResponseStatusCodeSame(409);
        $this->call('PATCH', "/api/trainers/{$boss['id']}/access", ['active' => false]);
        $this->assertResponseStatusCodeSame(422);

        $admin = $this->em()->getRepository(User::class)->find($adminId);
        $this->assertSame('ROLE_ADMIN', $admin->getRole());
        $this->assertSame('x', $admin->password);
        $this->client->loginUser($admin);
        $this->assertTrue($this->call('GET', '/api/auth/me')['trainer']);
        $this->call('GET', '/api/me/classes');
        $this->assertResponseIsSuccessful();

        $this->client->loginUser($this->em()->getRepository(User::class)->find($owner->getId()));
        $this->call('DELETE', "/api/trainers/{$boss['id']}");
        $admin = $this->em()->getRepository(User::class)->find($adminId);
        $this->assertTrue($admin->canLogin());
        $this->client->loginUser($admin);
        $this->call('GET', '/api/me/classes');
        $this->assertResponseStatusCodeSame(403);

        $this->loginAs('SUIVI');
        $this->call('POST', "/api/trainers/{$mine['id']}/access");
        $this->assertResponseStatusCodeSame(403);
    }

    public function testSuperAdminCanImpersonateAndComeBack(): void
    {
        $this->loginAs('SUPER_ADMIN', 'peer@example.test');
        $peer = $this->em()->getRepository(User::class)->findOneBy(['email' => 'peer@example.test'])->getId();
        $target = $this->call('POST', '/api/users', ['email' => 'suivi@example.test', 'name' => 'Cible', 'role' => 'ROLE_SUIVI', 'plainPassword' => 'un-mot-de-passe-long'])['id'];
        $owner = new User('owner@example.test', 'Proprietaire', '', ['ROLE_SUPER_ADMIN']);
        $owner->password = static::getContainer()->get(UserPasswordHasherInterface::class)->hashPassword($owner, 'un-mot-de-passe-long');
        $this->em()->persist($owner);
        $this->em()->flush();
        $this->client->restart();
        $this->client->jsonRequest('POST', '/api/auth/login', ['username' => 'owner@example.test', 'password' => 'un-mot-de-passe-long']);

        $this->call('POST', "/api/auth/impersonate/$peer");
        $this->assertResponseStatusCodeSame(403);
        $this->call('POST', "/api/auth/impersonate/$target");
        $this->assertResponseStatusCodeSame(204);
        $me = $this->call('GET', '/api/auth/me');
        $this->assertSame(['suivi@example.test', 'Proprietaire', false], [$me['email'], $me['impersonator'], $me['mustChangePassword']]);
        $this->call('GET', '/api/virtual-classes');
        $this->assertResponseIsSuccessful();
        $this->call('GET', '/api/users'); // only the borrowed rights apply
        $this->assertResponseStatusCodeSame(403);
        $this->call('POST', '/api/auth/change-password', ['password' => 'un-autre-mot-de-passe']);
        $this->assertResponseStatusCodeSame(403);
        $this->call('POST', "/api/auth/impersonate/$target");
        $this->assertResponseStatusCodeSame(403);

        $this->call('POST', '/api/auth/impersonate/exit');
        $this->assertResponseStatusCodeSame(204);
        $this->assertSame('owner@example.test', $this->call('GET', '/api/auth/me')['email']);
        $rows = $this->em()->getConnection()->fetchFirstColumn("SELECT user_email FROM audit_log WHERE action LIKE 'IMPERSONATION%'");
        $this->assertSame(['owner@example.test', 'owner@example.test'], $rows);

        $this->call('POST', '/api/auth/impersonate/exit');
        $this->assertResponseStatusCodeSame(409);
    }

    public function testUserEditKeepsUntouchedAccessAndReadsPhotoOnTheSheetOnly(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        $id = $this->call('POST', '/api/users', ['email' => 'e@example.test', 'name' => 'Avant Test', 'role' => 'ROLE_SUIVI', 'plainPassword' => 'un-mot-de-passe-long', 'profilePhoto' => $png, 'organizations' => ["/api/organizations/$org"]])['id'];
        $password = $this->em()->getRepository(User::class)->find($id)->password;
        $this->call('PATCH', "/api/users/$id", ['name' => 'Apres Test', 'jobTitle' => 'DPC', 'role' => 'ROLE_ADMIN', 'customRoleId' => 0, 'organizations' => ["/api/organizations/$org"]]);
        $this->assertResponseIsSuccessful();
        $sheet = $this->call('GET', "/api/users/$id");
        $this->assertSame(['Apres Test', 'ROLE_ADMIN', $png], [$sheet['name'], $sheet['role'], $sheet['profilePhoto']]);
        $this->assertCount(1, $sheet['organizations']);
        $this->assertSame($password, $this->em()->getRepository(User::class)->find($id)->password);
        foreach ($this->call('GET', '/api/users') as $row) {
            $this->assertArrayNotHasKey('profilePhoto', $row);
        }
    }

    public function testSuperAdminResendsATemporaryPassword(): void
    {
        $owner = $this->loginAs('SUPER_ADMIN', 'owner@example.test')->getId();
        $id = $this->call('POST', '/api/users', ['email' => 'r@example.test', 'name' => 'R', 'role' => 'ROLE_SUIVI', 'plainPassword' => 'un-mot-de-passe-long'])['id'];
        $account = fn () => $this->em()->getRepository(User::class)->find($id);
        $before = $account()->password;
        $this->call('POST', "/api/users/$id/access");
        $this->assertResponseStatusCodeSame(204);
        $this->assertEmailCount(1);
        $this->assertNotSame($before, $account()->password);
        $this->assertTrue($account()->mustChangePassword);

        $this->call('POST', "/api/users/$owner/access");
        $this->assertResponseStatusCodeSame(409);
        $this->call('PATCH', "/api/users/$id", ['active' => false]);
        $this->call('POST', "/api/users/$id/access");
        $this->assertResponseStatusCodeSame(409);

        $this->loginAs('ADMIN');
        $this->call('POST', "/api/users/$id/access");
        $this->assertResponseStatusCodeSame(403);
    }

    public function testTrainerSheetDocumentsAndSharedScope(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $a = $this->org();
        $b = $this->call('POST', '/api/organizations', ['name' => 'PHOCEA', 'code' => 'PHOCEA', 'emailFrom' => 'p@example.test'])['id'];
        $trainer = $this->call('POST', '/api/trainers', ['firstName' => 'Lea', 'lastName' => 'Test', 'email' => 'lea@example.test', 'profession' => 'Médecin',
            'rppsNumber' => '10101234567', 'formats' => ['VIRTUAL_CLASS'], 'biography' => 'Bio', 'organizations' => ["/api/organizations/$a", "/api/organizations/$b"]]);
        $this->assertResponseStatusCodeSame(201);
        $this->assertCount(2, $trainer['organizations']);
        $id = $trainer['id'];
        $this->call('PATCH', "/api/trainers/$id", ['formats' => ['AUTRE']]);
        $this->assertResponseStatusCodeSame(422);

        $path = tempnam(sys_get_temp_dir(), 'cv');
        file_put_contents($path, "%PDF-1.4\n%fictif\n");
        $this->client->request('POST', "/api/trainers/$id/documents/cv", [], ['file' => new \Symfony\Component\HttpFoundation\File\UploadedFile($path, 'cv.pdf', null, null, true)]);
        $this->assertResponseStatusCodeSame(204);
        $this->assertSame([['kind' => 'cv', 'name' => 'cv.pdf']], $this->call('GET', "/api/trainers/$id/documents"));

        // An admin of one organization sees the shared trainer but cannot change it or read the documents.
        $admin = $this->loginAs('ADMIN');
        $admin->addOrganization($this->em()->getRepository(\App\Entity\Organization::class)->find($a));
        $this->em()->flush();
        $this->client->loginUser($admin);
        $this->assertContains($id, array_column($this->call('GET', '/api/trainers'), 'id'));
        $this->call('PATCH', "/api/trainers/$id", ['biography' => 'Autre']);
        $this->assertResponseStatusCodeSame(403);
        $this->call('GET', "/api/trainers/$id/documents");
        $this->assertResponseStatusCodeSame(403);
        $this->call('DELETE', "/api/trainers/$id");
        $this->assertResponseStatusCodeSame(403);
        $this->assertSame(2, (int) $this->em()->getConnection()->fetchOne('SELECT count(*) FROM trainer_organization WHERE trainer_id = ?', [$id]));
    }

    public function testFormationUsesSharedAudienceAndAdditionalOrganizations(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $other = $this->call('POST', '/api/organizations', ['name' => 'Organisme associé', 'code' => 'ASSOC', 'emailFrom' => 'assoc@example.test', 'siret' => '12345678901235'])['id'];
        $audience = $this->call('POST', '/api/target-audiences', ['name' => 'Médecins']);
        $this->assertResponseStatusCodeSame(422);
        $created = $this->call('POST', '/api/target-audiences', ['name' => 'Médecins', 'acronym' => 'MED']);
        $this->assertSame('MED', $created['acronym']);
        $audience = $created['id'];
        $formation = $this->call('POST', '/api/formations', [
            'title' => 'Formation pilote',
            'organization' => "/api/organizations/$org",
            'additionalOrganizations' => ["/api/organizations/$other"],
            'targetAudience' => "/api/target-audiences/$audience",
            'acronym' => 'pilote 01',
            'reference' => 'saisie-ignoree',
        ]);
        $this->assertResponseStatusCodeSame(201);
        $this->assertSame($other, $formation['additionalOrganizations'][0]['id']);
        $this->assertSame('MED-PILOTE-01', $formation['reference']);
        $this->call('PATCH', "/api/target-audiences/$audience", ['name' => 'Médecins généralistes']);
        $this->assertResponseIsSuccessful();
        $this->assertSame('Médecins généralistes', $this->call('GET', '/api/formations/'.$formation['id'])['audience']);
        $url = '/api/formations/'.$formation['id'];
        // « active » is derived from the publication status and cannot be forced.
        $hidden = $this->call('PATCH', $url, ['publicationStatus' => 'unpublished', 'active' => true]);
        $this->assertSame(['unpublished', false], [$hidden['publicationStatus'], $hidden['active']]);
        $shown = $this->call('PATCH', $url, ['publicationStatus' => 'published']);
        $this->assertTrue($shown['active']);
        $this->call('PATCH', $url, ['andpcCodes' => [['organization' => 999999, 'year' => 2026, 'code' => 'X']]]);
        $this->assertResponseStatusCodeSame(422);
        $codes = [['organization' => $org, 'year' => 2026, 'code' => 'A-1'], ['organization' => $other, 'year' => 2026, 'code' => 'B-2']];
        $this->assertEquals($codes, $this->call('PATCH', $url, ['andpcCodes' => $codes])['andpcCodes']);
        $fifpl = [['organization' => $other, 'year' => 2026, 'code' => 'F-1', 'durationHours' => '7.5', 'priceHT' => '300']];
        $personal = [['organization' => $org, 'year' => 2026, 'priceHT' => '300', 'priceTTC' => '360']];
        $saved = $this->call('PATCH', $url, ['fifplCodes' => $fifpl, 'personalPrices' => $personal]);
        $this->assertEquals([$fifpl, $personal], [$saved['fifplCodes'], $saved['personalPrices']]);
        $this->call('PATCH', $url, ['fifplCodes' => [['organization' => 999999, 'year' => 2026, 'code' => 'X']]]);
        $this->assertResponseStatusCodeSame(422);
        $this->call('PATCH', $url, ['personalPrices' => [['year' => 2026, 'priceHT' => '-1']]]);
        $this->assertResponseStatusCodeSame(422);
        $this->call('PATCH', $url, ['price' => '-5']);
        $this->assertResponseStatusCodeSame(422);
        $this->assertSame('450.50', $this->call('PATCH', $url, ['price' => '450.50'])['price']);
        $this->call('PATCH', $url, ['acronym' => null]);
        $this->assertSame('MED-formation-pilote', $this->call('GET', $url)['reference']);
        $this->call('DELETE', "/api/target-audiences/$audience");
        $this->assertResponseStatusCodeSame(409);
    }

    public function testFormationDraftCanBeCompletedAndPublished(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $draft = $this->call('POST', '/api/formations', ['title' => 'Formation pilote', 'organization' => "/api/organizations/$org"]);
        $this->assertResponseStatusCodeSame(201);
        $this->assertSame('draft', $draft['publicationStatus']);
        $url = '/api/formations/'.$draft['id'];
        $details = [
            'orientation' => 'Prévention', 'description' => 'Description de test', 'objectives' => 'Objectifs de test',
            'evaluation' => 'Observation', 'language' => 'Français', 'prerequisites' => 'Aucun',
            'publicationStatus' => 'published', 'fundingTypes' => ['ANDPC'],
            'andpcCodes' => [['year' => 2026, 'code' => 'A2026-001']],
        ];
        $this->call('PATCH', $url, $details);
        $this->assertResponseIsSuccessful();
        $result = $this->call('GET', $url);
        foreach ($details as $key => $value) {
            $this->assertEquals($value, $result[$key]);
        }
    }

    public function testFormationDeletionRequiresNoSessionHistory(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $payload = ['organization' => "/api/organizations/$org", 'title' => 'Formation'];
        $unused = $this->call('POST', '/api/formations', $payload)['id'];
        $this->call('DELETE', "/api/formations/$unused");
        $this->assertResponseStatusCodeSame(204);

        $used = $this->call('POST', '/api/formations', $payload)['id'];
        $em = $this->em();
        $session = new \App\Entity\VirtualClass($em->find(\App\Entity\Formation::class, $used), new \DateTimeImmutable('-1 month'));
        $session->markDeleted();
        $em->persist($session);
        $em->flush();
        $this->call('DELETE', "/api/formations/$used");
        $this->assertResponseStatusCodeSame(409);
        $this->call('GET', "/api/formations/$used");
        $this->assertResponseIsSuccessful();
    }

    public function testUsedOrInactiveTimeSlotCannotBeDeletedOrBooked(): void
    {
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $formation = $this->call('POST', '/api/formations', ['organization' => "/api/organizations/$org", 'title' => 'Formation'])['id'];
        $trainer = $this->call('POST', '/api/trainers', ['firstName' => 'A', 'lastName' => 'B', 'email' => 'a@example.test', 'organizations' => ["/api/organizations/$org"]])['id'];
        $slot = $this->call('POST', '/api/time-slots', ['label' => 'Soir', 'startTime' => '18:00', 'endTime' => '20:00']);
        $this->assertTrue($slot['active']);
        $this->call('PATCH', "/api/time-slots/{$slot['id']}", ['active' => false]);
        $this->call('POST', '/api/scheduled-classes', ['date' => '2030-06-03', 'formationId' => $formation, 'dpcAction' => 'A', 'dpcSession' => 'S', 'slots' => [['timeSlotId' => $slot['id'], 'trainerId' => $trainer]]]);
        $this->assertResponseStatusCodeSame(422);
        $this->assertSame([], $this->call('GET', '/api/time-slot-usage'));

        $em = $this->em();
        $class = new \App\Entity\VirtualClass($em->getRepository(\App\Entity\Formation::class)->find($formation), new \DateTimeImmutable('+3 days'));
        $em->persist($class);
        $em->persist(new \App\Entity\ClassSlot($class, $em->getRepository(\App\Entity\TimeSlot::class)->find($slot['id']), $em->getRepository(\App\Entity\Trainer::class)->find($trainer)));
        $em->flush();
        $this->assertSame([$slot['id']], $this->call('GET', '/api/time-slot-usage'));
        $this->call('DELETE', "/api/time-slots/{$slot['id']}");
        $this->assertResponseStatusCodeSame(409);
    }

    public function testUserDeletionIsLogicalAndClosesTheAccount(): void
    {
        $owner = $this->loginAs('SUPER_ADMIN', 'owner@example.test')->getId();
        $id = $this->call('POST', '/api/users', ['email' => 'gone@example.test', 'name' => 'Gone', 'role' => 'ROLE_SUIVI', 'plainPassword' => 'un-mot-de-passe-long'])['id'];
        $this->call('DELETE', "/api/users/$owner");
        $this->assertResponseStatusCodeSame(403);
        $this->call('DELETE', "/api/users/$id");
        $this->assertResponseStatusCodeSame(204);
        $this->assertNotContains($id, array_column($this->call('GET', '/api/users'), 'id'));
        $this->call('GET', "/api/users/$id");
        $this->assertResponseStatusCodeSame(404);
        $db = $this->em()->getConnection();
        $row = $db->fetchAssociative('SELECT active, deleted_at FROM "user" WHERE id = ?', [$id]);
        $this->assertFalse($row['active']);
        $this->assertNotNull($row['deleted_at']);
        $this->assertSame('DELETE', $db->fetchOne("SELECT action FROM audit_log WHERE entity = 'User' AND entity_id = ? ORDER BY id DESC LIMIT 1", [$id]));
        $this->assertFalse($this->em()->getRepository(User::class)->find($id)->canLogin());

        $this->call('POST', '/api/users', ['email' => 'gone@example.test', 'name' => 'Again', 'role' => 'ROLE_SUIVI', 'plainPassword' => 'un-mot-de-passe-long']);
        $this->assertResponseStatusCodeSame(422);
        $trainer = $this->call('POST', '/api/trainers', ['firstName' => 'G', 'lastName' => 'One', 'email' => 'gone@example.test'])['id'];
        $this->call('POST', "/api/trainers/$trainer/access");
        $this->assertResponseStatusCodeSame(409);

        $this->loginAs('ADMIN');
        $this->call('DELETE', "/api/users/$owner");
        $this->assertResponseStatusCodeSame(403);
    }

    public function testArchivedConfigurationKeepsItsDeletionDate(): void
    {
        $this->em()->getConnection()->executeStatement('TRUNCATE zoom_account, virtual_class_config CASCADE');
        $this->loginAs('SUPER_ADMIN');
        $host = $this->call('POST', '/api/zoom-accounts', ['label' => 'Compte', 'profile' => 'DEMO', 'hostUserId' => 'archive'])['id'];
        $config = ['name' => 'Politique', 'hosts' => [$host], 'organizations' => [],
            'policy' => ['waitingRoom' => false, 'passcode' => true, 'joinBeforeHost' => true, 'recording' => 'none']];
        $this->call('POST', '/api/virtual-class-configs', $config);
        $this->assertResponseIsSuccessful();
        $db = $this->em()->getConnection();
        $id = (int) $db->fetchOne('SELECT id FROM virtual_class_config');
        $this->assertNull($db->fetchOne('SELECT deleted_at FROM virtual_class_config'));
        foreach ([true, false] as $archived) {
            $this->call('POST', '/api/virtual-class-configs', ['id' => $id, 'archived' => $archived] + $config);
            $this->assertResponseIsSuccessful();
            $this->assertSame($archived ? 1 : 0, (int) $db->fetchOne('SELECT count(*) FROM virtual_class_config WHERE deleted_at IS NOT NULL'));
        }
    }

    public function testCustomRoleIsDeletedOnlyWhenNobodyHasIt(): void
    {
        $this->em()->getConnection()->executeStatement('TRUNCATE custom_role CASCADE');
        $this->loginAs('SUPER_ADMIN', 'owner@example.test');
        $org = $this->org();
        $role = $this->call('POST', '/api/custom-roles', ['name' => 'Coordination', 'permissions' => ['PLANNING']])['id'];
        $user = $this->call('POST', '/api/users', ['email' => 'c@example.test', 'name' => 'C', 'role' => 'ROLE_LECTURE', 'customRoleId' => $role, 'organizations' => ["/api/organizations/$org"], 'plainPassword' => 'un-mot-de-passe-long'])['id'];
        $usage = $this->call('GET', '/api/custom-roles')['usage'];
        $this->assertSame([1, 1], [$usage["custom:$role"], $usage['ROLE_SUPER_ADMIN']]);
        $this->assertStringContainsString('1 personne', $this->call('DELETE', "/api/custom-roles/$role")['detail']);
        $this->assertResponseStatusCodeSame(409);

        $this->call('DELETE', "/api/users/$user");
        $this->call('DELETE', "/api/custom-roles/$role");
        $this->assertResponseStatusCodeSame(204);
        $this->assertSame([], $this->call('GET', '/api/custom-roles')['roles']);
        $this->assertNotNull($this->em()->getConnection()->fetchOne('SELECT deleted_at FROM custom_role WHERE id = ?', [$role]));
        $this->call('POST', '/api/users', ['email' => 'd@example.test', 'name' => 'D', 'role' => 'ROLE_LECTURE', 'customRoleId' => $role, 'organizations' => ["/api/organizations/$org"], 'plainPassword' => 'un-mot-de-passe-long']);
        $this->assertResponseStatusCodeSame(422);
        $this->loginAs('ADMIN');
        $this->call('DELETE', "/api/custom-roles/$role");
        $this->assertResponseStatusCodeSame(403);
    }

    public function testDeletedRecordsAreListedForAdminsWithinTheirScope(): void
    {
        $this->em()->getConnection()->executeStatement('TRUNCATE custom_role CASCADE');
        $this->loginAs('SUPER_ADMIN', 'owner@example.test');
        $org = $this->org();
        $ids = [
            'organizations' => $this->call('POST', '/api/organizations', ['name' => 'Ancien', 'code' => 'ANCIEN', 'emailFrom' => 'a@example.test'])['id'],
            'formations' => $this->call('POST', '/api/formations', ['organization' => "/api/organizations/$org", 'title' => 'Ancienne'])['id'],
            'trainers' => $this->call('POST', '/api/trainers', ['firstName' => 'A', 'lastName' => 'B', 'email' => 't@example.test', 'organizations' => ["/api/organizations/$org"]])['id'],
            'time-slots' => $this->call('POST', '/api/time-slots', ['label' => 'Soir', 'startTime' => '18:00', 'endTime' => '20:00'])['id'],
            'users' => $this->call('POST', '/api/users', ['email' => 'u@example.test', 'name' => 'U', 'role' => 'ROLE_SUIVI', 'plainPassword' => 'un-mot-de-passe-long'])['id'],
        ];
        foreach ($ids as $resource => $id) {
            $this->call('DELETE', "/api/$resource/$id");
            $this->assertResponseStatusCodeSame(204);
            $deleted = $this->call('GET', "/api/$resource?deleted=1");
            $this->assertSame([$id], array_column($deleted, 'id'), $resource);
            $this->assertNotEmpty(current($deleted)['deletedAt'] ?? null, $resource);
            $this->assertNotContains($id, array_column($this->call('GET', "/api/$resource"), 'id'));
        }
        $role = $this->call('POST', '/api/custom-roles', ['name' => 'Ancien', 'permissions' => ['PLANNING']])['id'];
        $this->call('DELETE', "/api/custom-roles/$role");
        $this->assertSame([$role], array_column($this->call('GET', '/api/custom-roles?deleted=1')['roles'], 'id'));

        $admin = $this->loginAs('ADMIN');
        $this->assertSame([], $this->call('GET', '/api/formations?deleted=1')); // no organization yet
        $this->assertResponseIsSuccessful();
        $admin = $this->em()->getRepository(User::class)->find($admin->getId());
        // A reference: the scope filter of the previous request would hide the organization from find().
        $admin->addOrganization($this->em()->getReference(\App\Entity\Organization::class, $org));
        $this->em()->flush();
        $this->client->loginUser($admin);
        $this->assertSame([$ids['formations']], array_column($this->call('GET', '/api/formations?deleted=1'), 'id'));

        $this->loginAs('SUIVI');
        $this->call('GET', '/api/formations?deleted=1');
        $this->assertResponseStatusCodeSame(403);
    }
}
