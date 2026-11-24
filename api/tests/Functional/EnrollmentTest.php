<?php

namespace App\Tests\Functional;

use App\Entity\Organization;
use App\Entity\Training;
use App\Entity\User;
use App\Entity\VirtualClass;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Messenger\Transport\InMemory\InMemoryTransport;

class EnrollmentTest extends WebTestCase
{
    private KernelBrowser $client;
    private EntityManagerInterface $em;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->client->disableReboot(); // keeps the in-memory Messenger transport between requests
        $this->em = static::getContainer()->get(EntityManagerInterface::class);
        $this->em->getConnection()->executeStatement('TRUNCATE enrollment, message_log, audit_log, participant, virtual_class, training, organization, "user" RESTART IDENTITY CASCADE');
    }

    private function makeClass(int $capacity): VirtualClass
    {
        $org = new Organization('SOFIA', 'SOFIA', 'sofia@example.test');
        $class = new VirtualClass(new Training($org, 'Formation fictive'), new \DateTimeImmutable('+7 days'), $capacity);
        $this->em->persist($org);
        $this->em->persist($class->training);
        $this->em->persist($class);
        $this->em->flush();

        return $class;
    }

    private function login(string $role): void
    {
        $user = new User("$role@example.test", 'Test', 'x', ["ROLE_$role"]);
        $this->em->persist($user);
        $this->em->flush();
        $this->client->loginUser($user);
    }

    /** @return array<string, mixed> */
    private function enroll(VirtualClass $c, string $email): array
    {
        $this->client->jsonRequest('POST', "/api/virtual-classes/{$c->getId()}/enrollments", ['firstName' => 'Ana', 'lastName' => 'Test', 'email' => $email]);

        return json_decode($this->client->getResponse()->getContent(), true);
    }

    public function testEnrollQueuesMailAndEnforcesCapacityAndDuplicates(): void
    {
        $c = $this->makeClass(1);
        $this->login('SUIVI');

        $this->enroll($c, 'A@Example.test');
        $this->assertResponseStatusCodeSame(201);
        /** @var InMemoryTransport $transport */
        $transport = static::getContainer()->get('messenger.transport.async');
        $this->assertCount(1, $transport->getSent());

        $this->assertSame('ALREADY_ENROLLED', $this->enroll($c, 'a@example.test')['code']); // email is case-insensitive
        $this->assertResponseStatusCodeSame(409);

        $this->assertSame('CAPACITY_REACHED', $this->enroll($c, 'b@example.test')['code']);
        $this->assertResponseStatusCodeSame(409);
    }

    public function testCancelFreesSeat(): void
    {
        $c = $this->makeClass(1);
        $this->login('SUIVI');
        $id = $this->enroll($c, 'a@example.test')['id'];
        $this->client->request('DELETE', "/api/enrollments/$id");
        $this->assertResponseStatusCodeSame(204);
        $this->enroll($c, 'b@example.test');
        $this->assertResponseStatusCodeSame(201);
    }

    public function testRolesAndValidation(): void
    {
        $c = $this->makeClass(5);
        $this->client->jsonRequest('POST', "/api/virtual-classes/{$c->getId()}/enrollments", []);
        $this->assertResponseStatusCodeSame(401);

        $this->login('LECTURE');
        $this->enroll($c, 'a@example.test');
        $this->assertResponseStatusCodeSame(403);
        $this->client->request('GET', "/api/virtual-classes/{$c->getId()}/enrollments");
        $this->assertResponseIsSuccessful();

        $this->login('SUIVI');
        $this->enroll($c, 'not-an-email');
        $this->assertResponseStatusCodeSame(422);
    }
}
