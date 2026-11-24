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
    }
}
