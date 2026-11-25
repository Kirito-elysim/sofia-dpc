<?php

namespace App\Tests\Functional;

use App\Entity\AuditLog;
use App\Entity\Training;
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
        $this->em()->getConnection()->executeStatement('TRUNCATE audit_log, enrollment, trainer, time_slot, participant, virtual_class, training, organization, "user" RESTART IDENTITY CASCADE');
    }

    private function em(): EntityManagerInterface
    {
        return static::getContainer()->get(EntityManagerInterface::class);
    }

    private function loginAs(string $role): User
    {
        $u = new User("$role@example.test", 'Test', 'x', ["ROLE_$role"]);
        $this->em()->persist($u);
        $this->em()->flush();
        $this->client->loginUser($u);

        return $u;
    }

    /**
     * @param array<string, mixed> $body
     *
     * @return array<string, mixed>
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
        $this->loginAs('ADMIN');
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
            $this->loginAs('LECTURE');
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
            $this->call('DELETE','/api/organizations/'.$id);
            self::assertResponseStatusCodeSame(204);
            self::assertNotContains($id,array_column($this->call('GET','/api/organizations'),'id'));
            $this->call('GET',$url.'/documents/qualiopi');
            self::assertResponseStatusCodeSame(404);
        } finally {
            unlink($file);
        }
    }

    public function testOrganizationCrudRolesValidationAndAudit(): void
    {
        $this->loginAs('LECTURE');
        $this->call('POST', '/api/organizations', ['name' => 'X', 'code' => 'X1', 'emailFrom' => 'x@example.test']);
        $this->assertResponseStatusCodeSame(403);

        $this->loginAs('ADMIN');
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
    }

    public function testScheduleBlocksOverlapAndKeepsOneClassForTwoSlots(): void
    {
        $this->em()->getConnection()->executeStatement('TRUNCATE zoom_account CASCADE');
        $this->loginAs('SUPER_ADMIN');
        $org = $this->org();
        $training = $this->call('POST', '/api/trainings', ['title' => 'Test Zoom', 'organization' => "/api/organizations/$org"])['id'];
        $trainer = $this->call('POST', '/api/trainers', ['firstName' => 'Test', 'lastName' => 'Zoom', 'email' => 'trainer@example.test', 'trainings' => ["/api/trainings/$training"]])['id'];
        $slots = [];
        foreach ([['Matin', '09:00', '13:00'], ['Après-midi', '14:00', '17:00']] as [$label, $startTime, $endTime]) {
            $slots[] = ['trainerId' => $trainer, 'timeSlotId' => $this->call('POST', '/api/time-slots', compact('label', 'startTime', 'endTime'))['id']];
        }
        $body = ['date' => '2030-06-03', 'trainingId' => $training, 'dpcAction' => '001', 'dpcSession' => '002', 'slots' => $slots];
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
        $otherTrainer = $this->call('POST', '/api/trainers', ['firstName' => 'Autre', 'lastName' => 'Test', 'email' => 'second@example.test', 'trainings' => ["/api/trainings/$training"]])['id'];
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
        $training = $this->call('POST', '/api/trainings', ['title' => 'Atelier', 'organization' => "/api/organizations/$org"])['id'];
        $trainer = $this->call('POST', '/api/trainers', ['firstName' => 'Ana', 'lastName' => 'Test', 'email' => 'ana@example.test', 'trainings' => ["/api/trainings/$training"]])['id'];
        $time = $this->call('POST', '/api/time-slots', ['label' => 'Matin', 'startTime' => '09:00', 'endTime' => '13:00'])['id'];
        $host = $this->call('POST', '/api/zoom-accounts', ['label' => 'Compte test', 'profile' => 'DEMO', 'hostUserId' => 'test'])['id'];
        $configPayload=['name'=>'Politique organisme','hosts'=>[$host],'organizations'=>[$org],
            'policy'=>['waitingRoom'=>false,'passcode'=>false,'joinBeforeHost'=>true,'recording'=>'none']];
        $this->call('POST','/api/virtual-class-configs',$configPayload);
        self::assertResponseStatusCodeSame(422);
        $configPayload['policy']['passcode']=true;
        $config=$this->call('POST','/api/virtual-class-configs',$configPayload);
        self::assertResponseIsSuccessful();
        $class = $this->call('POST', '/api/scheduled-classes', ['date' => '2030-06-03','trainingId' => $training,'dpcAction' => 'A','dpcSession' => 'S','slots' => [['timeSlotId' => $time,'trainerId' => $trainer]]])['id'];
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
        $training = $this->call('POST', '/api/trainings', ['title' => 'Atelier', 'organization' => "/api/organizations/$org"])['id'];
        $trainer = $this->call('POST', '/api/trainers', ['firstName' => 'Ana', 'lastName' => 'Test', 'email' => 'ana@example.test', 'trainings' => ["/api/trainings/$training"]])['id'];
        $time = $this->call('POST', '/api/time-slots', ['label' => 'Matin', 'startTime' => '09:00', 'endTime' => '13:00'])['id'];
        $host = $this->call('POST', '/api/zoom-accounts', ['label' => 'Compte test', 'profile' => 'DEMO', 'hostUserId' => 'test'])['id'];
        $class = $this->call('POST', '/api/scheduled-classes', ['date' => '2030-06-03','trainingId' => $training,'dpcAction' => 'A','dpcSession' => 'S','slots' => [['timeSlotId' => $time,'trainerId' => $trainer]]])['id'];
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
        $this->loginAs('ADMIN');
        $fields = ['name'=>'Relance test','channel'=>'SMS','organization'=>'Tous','triggerLabel'=>'J-3','body'=>'Bonjour {prenom}'];
        $row = $this->call('POST', '/api/message-templates', $fields);
        $this->assertResponseStatusCodeSame(201);
        $url = '/api/message-templates/'.$row['id'];
        $this->call('PATCH', $url, ['body'=>str_repeat('a', 160)]);
        $this->assertResponseStatusCodeSame(422);
        $this->assertFalse($this->call('PATCH', $url, ['active'=>false])['active']);
        $this->loginAs('LECTURE');
        $this->call('GET', '/api/message-templates');
        $this->assertResponseIsSuccessful();
        $this->call('PATCH', $url, ['active'=>true]);
        $this->assertResponseStatusCodeSame(403);
    }

    public function testTrainingTrainerTimeSlot(): void
    {
        $this->loginAs('ADMIN');
        $org = $this->org();
        $t = $this->call('POST', '/api/trainings', ['organization' => "/api/organizations/$org", 'title' => 'Formation fictive', 'defaultCapacity' => 20]);
        $this->assertResponseStatusCodeSame(201);

        $tr = $this->call('POST', '/api/trainers', ['firstName' => 'Jean', 'lastName' => 'Test', 'email' => 'j@example.test', 'trainings' => ["/api/trainings/{$t['id']}"]]);
        $this->assertResponseStatusCodeSame(201);
        $this->assertCount(1, $tr['trainings']);

        $slot = $this->call('POST', '/api/time-slots', ['label' => 'Matin', 'startTime' => '09:00', 'endTime' => '13:00']);
        $this->assertSame(240, $slot['durationMin']);
        $this->call('POST', '/api/time-slots', ['label' => 'KO', 'startTime' => '13:00', 'endTime' => '09:00']);
        $this->assertResponseStatusCodeSame(422);

        // Deleting a training detaches it from trainers; deleting an organization that still has trainings is refused.
        $this->call('DELETE', "/api/organizations/$org");
        $this->assertResponseStatusCodeSame(409);
        $this->call('DELETE', "/api/trainings/{$t['id']}");
        $this->assertResponseStatusCodeSame(204);
        $this->assertCount(0, $this->call('GET', "/api/trainers/{$tr['id']}")['trainings']);
        $this->assertSame(0, $this->em()->getRepository(Training::class)->count([]));
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
        $train = $this->call('POST', '/api/trainings', ['organization' => "/api/organizations/$org", 'title' => 'Formation', 'defaultCapacity' => 20]);
        $mine = $this->call('POST', '/api/trainers', ['firstName' => 'A', 'lastName' => 'B', 'email' => 'a@example.test']);
        $other = $this->call('POST', '/api/trainers', ['firstName' => 'C', 'lastName' => 'D', 'email' => 'c@example.test']);

        // A FORMATEUR account needs exactly one trainer, and a staff account none.
        $this->call('POST', '/api/users', ['email' => 'f@example.test', 'name' => 'F', 'role' => 'ROLE_FORMATEUR', 'plainPassword' => 'un-mot-de-passe-long']);
        $this->assertResponseStatusCodeSame(422);
        $this->call('POST', '/api/users', ['email' => 'f@example.test', 'name' => 'F', 'role' => 'ROLE_LECTURE', 'trainer' => "/api/trainers/{$mine['id']}", 'plainPassword' => 'un-mot-de-passe-long']);
        $this->assertResponseStatusCodeSame(422);
        $u = $this->call('POST', '/api/users', ['email' => 'f@example.test', 'name' => 'F', 'role' => 'ROLE_FORMATEUR', 'trainer' => "/api/trainers/{$mine['id']}", 'plainPassword' => 'un-mot-de-passe-long']);
        $this->assertResponseStatusCodeSame(201);

        $em = $this->em();
        $t = $em->getRepository(\App\Entity\Training::class)->find($train['id']);
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

        $this->client->loginUser($em->getRepository(User::class)->find($u['id']));
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
}
