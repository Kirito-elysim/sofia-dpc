# HANDOFF — à lire en premier par toute IA qui reprend le projet

Lire dans l'ordre : `CLAUDE.md` (règles métier et conventions, font foi), `docs/cahier-des-charges.md`,
`docs/doc-technique.md` (modèle de données, Zoom, notifications), `docs/maquettes/planning.png`, puis `SUIVI.md`
(ce qui est fait / à faire). `HANDOFF.md` décrit l'état technique réel du dépôt, `SUIVI.md` l'avancement.

## Lancer le projet

```bash
docker compose up -d database redis mailpit php worker       # API sur http://localhost:8000
docker compose exec php php bin/console doctrine:migrations:migrate -n
docker compose exec php php bin/console app:seed-demo        # organismes + 2 classes fictives
docker compose exec php php bin/console app:user:create admin@example.test Admin 'MotDePasse!' ADMIN
cd front && npm install && npm run dev                        # http://localhost:5173 (proxy /api -> :8000)
```
Mails de dev : Mailpit http://localhost:8026. Le conteneur `front` du compose fait la même chose que la dernière ligne.

## Qualité (à passer avant de conclure une tâche)

```bash
docker compose exec php vendor/bin/phpstan analyse --memory-limit=512M
docker compose exec php php bin/phpunit          # base app_test : doctrine:database:create + schema:update --env=test la 1re fois
cd front && npm run lint && npm test && npm run build
```

## Mails via Gmail (état actuel)
- Transport = `MAILER_DSN`. Par défaut Mailpit (rien ne part). Pour envoyer pour de vrai depuis la boîte Gmail :
  copier `api/.env.local.example` en `api/.env.local` (non commité), créer un **mot de passe d'application** Google
  (validation en 2 étapes requise) et renseigner `gmail://ADRESSE%40gmail.com:MOT_DE_PASSE_APP@default`.
- Gmail n'accepte comme expéditeur que l'adresse authentifiée (ou un alias « Envoyer en tant que ») :
  `Organization.emailFrom` doit donc valoir cette adresse en attendant les boîtes Workspace par organisme.
- L'envoi passe par Messenger (transport Redis `async`, 3 essais avec backoff, échecs dans la table `messenger_messages`
  file `failed`). **Le conteneur `worker` doit tourner**, sinon rien ne part.
- Pas encore testé contre un vrai compte Gmail (pas d'identifiants dans cette session) : seul Mailpit est vérifié.
- Quotas Gmail (~500 destinataires/jour pour un compte gratuit) : surveiller avant les relances en masse.

## Architecture réelle (écarts avec doc-technique.md)
- Monorepo : `api/` (Symfony 7.4 LTS, API Platform 4, Doctrine ORM 3, PHP 8.3), `front/` (React 19 + Vite + Tailwind 4 +
  TanStack Query + React Router, tests Vitest), `docker/` (image FrankenPHP dev), `docker-compose.yml` (dev uniquement).
- Entités à plat dans `api/src/Entity` (pas de découpage `Domain/Infrastructure/Api` — à introduire si le code grossit).
  Noms en anglais : `Organization`, `Training`, `VirtualClass`, `Participant`, `Enrollment`, `MessageLog`, `AuditLog`, `User`.
- Le front parle JSON (`Accept: application/json`) ; client typé écrit à la main dans `front/src/api.ts`
  (pas de génération OpenAPI pour l'instant). Routes API Platform en kebab-case : `/api/virtual-classes`.
- Auth : session par cookie, `POST /api/auth/login` (JSON `{username,password}`), `GET /api/auth/me`, `POST /api/auth/logout`.
  Hiérarchie des rôles : SUPER_ADMIN > ADMIN > SUIVI > LECTURE. **Pas de 2FA TOTP** (exigée pour les admins) ;
  limitation de tentatives de connexion : 5.
- Tout `/api` exige d'être authentifié (sauf login et docs).

## Paramétrage (CRUD)
- Ressources API Platform directement sur les entités (`api/src/Entity`) : `Organization` (`/api/organizations`), `Training` (`/api/trainings`),
  `TimeSlot` (`/api/time-slots`, heures en chaînes `HH:MM`, durée calculée), `Trainer` (`/api/trainers`, N-N formations par IRI),
  `User` (`/api/users`). Lecture : ROLE_LECTURE ; écriture : ROLE_ADMIN ; **utilisateurs : ROLE_SUPER_ADMIN uniquement**.
- Groupes de sérialisation `read`/`write` (`user:read`/`user:write` pour User). Relations en écriture par IRI (`/api/organizations/1`).
  PATCH exige `Content-Type: application/merge-patch+json`. Pagination désactivée (référentiels petits) : à revoir pour classes/inscrits.
- Suppression d'une ligne encore référencée → 409 (`ForeignKeyConstraintViolationException` mappée dans `api_platform.yaml`) ;
  supprimer une formation la détache des formateurs (ON DELETE CASCADE). Organisme : préférer `active=false` à la suppression.
- Utilisateurs : pas de DELETE (on désactive, `active=false`, refusé à la connexion par `UserChecker`). Mot de passe : `plainPassword`
  (12 caractères min) haché par `UserProcessor` ; on ne peut ni se désactiver ni changer son propre rôle. Un seul rôle par utilisateur
  (`role` = `ROLE_*`), la hiérarchie fait le reste.
- Front : un composant générique `front/src/components/CrudPage.tsx` configuré par champs dans `front/src/pages/Settings.tsx`
  (menu « Paramétrage » : Organismes, Formations, Créneaux, Formateurs, Utilisateurs et rôles pour SUPER_ADMIN).
  Ajouter un référentiel = une entité + une liste de champs. Le logo d'organisme (upload) n'est pas fait.

## Inscription d'un PS — comment ça marche
- `EnrollmentService::enroll` (`api/src/Service`) : transaction + verrou pessimiste sur la classe ; refuse si classe non
  `PLANNED` (`CLASS_NOT_OPEN`), déjà inscrit (`ALREADY_ENROLLED`), capacité atteinte (`CAPACITY_REACHED`), tous en 409
  `application/problem+json` avec un `code` stable. Le PS est retrouvé par e-mail (insensible à la casse) sinon créé.
  Une inscription annulée peut être réactivée. Après commit : message `SendEnrollmentConfirmation` (async).
- `SendEnrollmentConfirmationHandler` relit l'état (annulée = pas d'envoi), envoie le mail (twig `templates/email/`),
  écrit un `MessageLog` SENT/FAILED, relance via Messenger en cas d'échec transport.
- Endpoints (`EnrollmentController`) : `GET|POST /api/virtual-classes/{id}/enrollments`, `DELETE /api/enrollments/{id}`
  (annulation = statut CANCELLED, pas de suppression). POST/DELETE : ROLE_SUIVI ; GET : ROLE_LECTURE.
- L'audit est automatique : `AuditListener` (`api/src/EventListener`) écrit un `AuditLog` (CREATE/UPDATE/DELETE, diff des champs, auteur, IP)
  pour toute entité sauf `AuditLog`/`MessageLog`. Il ne couvre pas encore les connexions/échecs de connexion ni les relances manuelles.
- Front : `/classes` (liste, inscrits/capacité) et `/classes/:id` (formulaire d'inscription, liste, annulation).

## Pièges connus
- Symfony 7.3 est bloqué par Composer (avis de sécurité) : rester en 7.4.
- `wrapInTransaction()` ferme l'EntityManager sur toute exception : l'inscription utilise `beginTransaction/rollBack` à la main.
- En test, le transport Messenger `in-memory` est remis à zéro entre deux requêtes : n'asserter la file qu'juste après la requête.
- Les ports hôte 8025 et 8000/5432/5173 peuvent déjà être pris : Mailpit est exposé sur 8026.
- Aucune donnée réelle de PS dans le code, fixtures ou tests (règle CLAUDE.md) ; `app:seed-demo` est fictif.
