# HANDOFF — à lire en premier par toute IA qui reprend le projet

Lire dans l'ordre : `CLAUDE.md` (règles métier et conventions, font foi), `docs/cahier-des-charges.md`,
`docs/doc-technique.md` (modèle de données, Zoom, notifications), `docs/maquettes/planning.png`, puis `SUIVI.md`
(ce qui est fait / à faire). `HANDOFF.md` décrit l'état technique réel du dépôt, `SUIVI.md` l'avancement.

## Reprise du 24 novembre 2026 — phase 1 en cours

### Livraison locale — annuaire, traçabilité et événements Zoom

- Participants (PS) ouvre un annuaire paginé et filtrable, accessible au personnel en lecture. La fiche apprenant réunit ses coordonnées, ses inscriptions et les tentatives de communication enregistrées. Depuis une inscription active à une classe planifiée ou en cours, le rôle SUIVI peut demander une relance manuelle par mail. Le worker vérifie à nouveau le statut, consigne le résultat du transport et conserve l’auteur. Une acceptation SMTP ne prouve pas la remise en boîte de réception.
- Journal d’audit ouvre une liste paginée réservée aux administrateurs ; auteur, date, action, ressource et identifiant sont affichés. Les connexions réussies, les échecs de connexion et les demandes de relance sont tracés. `GET /health` vérifie la disponibilité de PostgreSQL.
- Le profil de chaque hôte dans `ZOOM_PROFILES` accepte un champ serveur `webhook_secret`. Dans Zoom Marketplace, l’URL à enregistrer est `https://<domaine-public>/webhooks/zoom/<identifiant-local-du-compte>`. Souscrire à `meeting.participant_joined` et `meeting.participant_left`. Le point d’entrée vérifie la signature HMAC, la fraîcheur de la requête et le compte source ; il traite aussi le challenge de validation Zoom. Voir la [documentation des webhooks](https://developers.zoom.us/docs/api/webhooks/).
- La migration `Version20261124171000` est appliquée dans les bases locales de développement et de test. Les événements sont dédupliqués par créneau, connexion, type et instant. Un e-mail reconnu permet le rapprochement avec le formateur affecté ou une inscription active. Une identité inconnue reste à vérifier ; le nom affiché seul n’est jamais utilisé pour la compter comme apprenant.
- Suivi en direct affiche les 100 événements les plus récents avec une actualisation toutes les cinq secondes. Le tableau de bord historique porte le libellé Démonstration et donne accès au suivi réel. Le taux de présence, la consolidation des connexions multiples et la livraison des alertes automatiques restent à implémenter. Le mode de rapprochement par identifiant nominatif Zoom doit compléter l’e-mail, parfois absent.
- Tests exécutés localement : 12 PHPUnit, 96 assertions, PHPStan et lint du conteneur Symfony ; 2 tests frontend, lint et build. Les tests de webhook emploient un secret fictif dans l’environnement test et couvrent le rejet de signature incorrecte, les rejeux et les trois catégories de personnes. Aucun service externe contacté par ces tests.
- Restent à valider sur l’environnement cible : URL HTTPS publique acceptée par Zoom, abonnements aux événements pour chaque compte, réception réelle après connexion et déconnexion, accès SMTP/OVH/Zoho, exploitation et restauration. Le contrôle antérieur sur le démarrage des workers externes reste applicable.

### Formateurs et apprenants

Chaque formateur est affecté par créneau. Les apprenants (PS) sont inscrits une fois par classe et occupent les places. La fiche de classe affiche les deux listes séparément. Une inscription qui utilise l’adresse du formateur affecté ou de son compte lié est refusée avec `TRAINER_ASSIGNED_TO_CLASS`. Un formateur peut suivre une autre classe en tant qu’apprenant. Cette distinction est locale à Sofia ; la correspondance des présences et des liens nominatifs Zoom reste dans le chantier décrit ci-dessous.

### Parcours livré localement

- Les six vues Tableau de bord, Planning, Organismes, Formations, Formateurs et Utilisateurs sont intégrées. Les référentiels utilisent l’API. Le tableau de bord conserve les chiffres de démonstration de la maquette, avec un accès distinct au suivi des événements Zoom. Le planning interroge désormais `GET /api/planning`, démarre à la semaine courante et inclut les anciennes classes sans créneau avec un horaire à préciser. Les cartes ouvrent la fiche de classe. Les indicateurs dédupliquent les demi-journées par classe.
- Depuis Planning → Créer une classe, un ADMIN sélectionne formation, date, capacité, action/session DPC, référence facultative et formateur habilité pour chaque créneau. `POST /api/scheduled-classes` réserve toute la session dans une transaction. Le client envoie un `Idempotency-Key` stable pour les tentatives d’une même soumission. Un conflit sur un créneau annule toute la session, renvoie 409 et programme une alerte mail aux administrateurs actifs via Messenger.
- Paramétrage → Comptes Zoom est réservé au SUPER_ADMIN. Chaque ligne désigne un hôte Zoom distinct et un profil de secrets serveur. Les créations utilisent des verrous PostgreSQL dans l’ordre des hôtes puis une recherche de chevauchement par intervalle. La marge est configurable en minutes. Un traitement séparé revendique les créneaux par `SKIP LOCKED`.
- Le mode actuellement implémenté crée une réunion programmée avec inscription obligatoire pour chaque demi-journée. L’autre stratégie reste à valider. Symfony obtient un jeton OAuth par profil, le conserve dans un pool Redis jusqu’à cinq minutes avant expiration et réessaie une fois après un 401. Aucun identifiant de réunion, mot de passe ou secret de compte n’est demandé au navigateur pour créer la réunion.
- Mes classes ouvre Zoom dans un nouvel onglet pour les créneaux prêts du formateur affecté. Le lien standard utilise le numéro de réunion ; Zoom gère les exigences d’inscription et de code secret. Les liens nominatifs automatiques restent à livrer.
- Dernières migrations appliquées aux bases locales de développement et de test : couleurs d’organisme, nouveaux champs formations/formateurs, rattachement utilisateur et dernière connexion, réservations Zoom et protection contre les soumissions répétées. Twig a été corrigé de 3.31.0 à 3.31.1 ; Composer ne signale plus les sept avis précédents.

### Configuration et traitement des réunions

1. Renseigner les secrets dans le gestionnaire de secrets du déploiement ou dans `api/.env.local`. Le modèle sans valeurs est dans `api/.env.local.example`. `ZOOM_PROFILES` associe chaque profil aux clés `account_id`, `client_id`, `client_secret` (application Server-to-Server OAuth). `ZOOM_REDIS_DSN` désigne le cache serveur. Les secrets et jetons ne doivent figurer ni dans le dépôt ni dans ce document.
2. Créer les hôtes réels dans le référentiel avec leur identifiant Zoom et leur profil. Paramétrer `ZOOM_BUFFER_MINUTES` (défaut local 0). Choisir une formation active avec un formateur habilité.
3. Appliquer les migrations avec `php bin/console doctrine:migrations:migrate -n` et installer le frontend avec `npm ci` dans `front`.
4. `zoom-worker` appelle `app:zoom:provision` toutes les dix secondes. Ce service peut **créer de vraies réunions**. Le worker Messenger peut **envoyer des mails**. Le contrôle automatique a refusé l’activation/redémarrage combiné de ces services pendant cette intervention. Aucun démarrage de ces services, aucun POST Zoom réel et aucun envoi externe n’ont été réalisés par cette intervention.
5. États de réservation : `pending` (en attente), `processing` (revendiqué), `ready` (numéro enregistré), `review` (échec ou résultat distant incertain). En cas d’arrêt après l’appel distant, un créneau peut rester en `processing`. Vérifier l’hôte, le créneau et l’existence de la réunion chez Zoom avant toute reprise. La réconciliation automatique et l’interface opérateur de reprise restent à livrer. Les comptes synchronisés hors Sofia et les réunions créées directement dans Zoom ne sont pas contrôlés par l’allocateur actuel.

### Vérifications effectuées

- PHPUnit couvre la réservation matin/après-midi, le rollback, les soumissions répétées, l’allocation de deux hôtes sur le même créneau, la saturation et le renouvellement OAuth après 401. HTTP Zoom simulé.
- Front : compilation, lint et tests Vitest. API : PHPUnit et PHPStan.
- La recette réelle des hôtes licenciés, des permissions Marketplace et des liens reste à effectuer.

### Suite du cahier des charges

| Chantier | Reste à livrer ou valider |
| --- | --- |
| Cycle de vie | Déplacement, annulation, suppression distante, libération des réservations et réémission des liens. Réconciliation après panne et contrôle de concurrence avec test multi-processus. |
| Liens nominatifs | Inscription par PS **et par créneau**, stockage protégé, envoi après création, révocation et régénération. Inscription automatique du formateur et décision hôte/co-hôte. |
| Présence | Recette des webhooks sur comptes réels, agrégation des durées, déconnexion/reconnexion multi-appareils, diffusion Mercure et branchement des indicateurs du tableau de bord. |
| Communications | Modèles éditables par organisme, historique et relance manuelle, mails J−3/J−1/J, SMS et mails T−5/+3/+8, silence SMS 20 h–8 h, alerte visuelle et sonore à +10 min. |
| Attestations | Statut Zoho Sign, date et auteur ; taux et seuil paramétrables après validation métier. |
| Exploitation | TOTP admin, CI, hébergement France, sauvegarde externalisée et exercice de restauration ; recette SMTP, Zoom et OVH sur comptes désignés. |

La phase 2 reste hors du périmètre actuel. Références officielles : [OAuth serveur-à-serveur](https://developers.zoom.us/docs/internal-apps/s2s-oauth/).

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
  pour toute entité sauf `AuditLog`/`MessageLog`. Les événements de connexion et de relance sont décrits en tête de document.
- Front : `/classes` (liste, inscrits/capacité) et `/classes/:id` (formulaire d'inscription, liste, annulation).

## Pièges connus
- Symfony 7.3 est bloqué par Composer (avis de sécurité) : rester en 7.4.
- `wrapInTransaction()` ferme l'EntityManager sur toute exception : l'inscription utilise `beginTransaction/rollBack` à la main.
- En test, le transport Messenger `in-memory` est remis à zéro entre deux requêtes : n'asserter la file qu'juste après la requête.
- Les ports hôte 8025 et 8000/5432/5173 peuvent déjà être pris : Mailpit est exposé sur 8026.
- Aucune donnée réelle de PS dans le code, fixtures ou tests (règle CLAUDE.md) ; `app:seed-demo` est fictif.

## Rôles par contexte : compte formateur
- `ROLE_FORMATEUR` est **hors hiérarchie** staff : il n'accède qu'à `GET /api/me/classes` (ses demi-journées à venir, annulées exclues) et à l'écran « Mes classes ». Le reste de l'API lui renvoie 403.
- Un compte FORMATEUR est lié à exactement un `Trainer` (`User.trainer`, unique) ; un compte staff n'en a pas (validation 422). Création : Paramétrage > Utilisateurs et rôles.
- `ClassSlot` (classe + créneau + formateur) existe en version minimale ; la réservation et le provisionnement Zoom sont décrits dans la section de reprise ci-dessus. `app:seed-demo` crée un formateur et des slots de démo.
- Pas de rôle par organisme : un rôle staff est global (à faire si besoin, voir SUIVI).

### Page de connexion
La page utilise les logos et pictogrammes extraits de connexion.png. Rendu contrôlé dans Chromium en 1672 × 941, 1440 × 900 et 390 × 844, sans débordement horizontal. Le formulaire utilise /api/auth/login. La case de mémorisation conserve uniquement l’adresse email. Le bouton Google est affiché et son authentification reste à intégrer et la récupération de mot de passe renvoie vers l’administrateur.

### Suivi de présence par apprenant
Le menu Suivi en direct interroge /api/live-presence/learners toutes les cinq secondes. La synthèse couvre les inscriptions actives des créneaux en cours (heure de Paris). Elle fusionne les intervalles Zoom qui se chevauchent, borne le cumul au début du créneau et signale visuellement une absence de plus de dix minutes après déconnexion. Le journal conserve les événements formateur, apprenant et identité inconnue. Les sorties sans email ferment la connexion lorsque le même identifiant technique est fourni. Une entrée sans identité reconnue ne crédite aucun apprenant.
Vérifications locales : 12 tests PHPUnit, 103 assertions, 2 tests frontend, lint et build. Le worker Zoom est démarré. La recette avec comptes Zoom réels, le taux final pour les attestations, les relances automatiques et l’authentification Google restent ouverts.

### Journal d’audit et modèles de messages
Le menu Journal d’audit donne accès aux événements réels, à la recherche, aux filtres, au tri, aux statistiques par action et à l’export CSV de la sélection. Les historiques ne portent pas de rattachement systématique à un organisme.
Paramétrage → Modèles de messages présente les déclencheurs, les modèles filtrables et les aperçus e-mail/SMS. La migration Version20261124180000 initialise huit modèles. Les administrateurs peuvent créer, modifier, dupliquer et activer/désactiver un modèle. Les modifications sont conservées en base. L’exploitation de ces textes par le moteur d’envoi automatique reste à raccorder.
Contrôle de rendu dans Chromium avec données de test en 1440 × 900 et 1672 × 941, sans débordement horizontal de page.

### Rappels personnalisés avant un créneau
Dans Modèles de messages, sélectionner le canal, saisir le délai en minutes, heures ou jours et choisir la condition de présence Zoom. Le délai est relatif au début de chaque créneau (heure de Paris). Une règle s’applique aux inscriptions actives de l’organisme sélectionné, ou de tous les organismes. Les anciens modèles restent sans horaire jusqu’à leur configuration.
Le service Compose reminder-worker vérifie les échéances toutes les 15 secondes avec une tolérance de deux minutes. Une réservation unique par modèle, inscription et créneau évite le double envoi. Les SMS hors de la plage 8 h–20 h sont ignorés. Les statuts PENDING, SENT et FAILED sont enregistrés dans message_log. Une transmission incertaine ne fait pas l’objet d’un nouvel envoi automatique. Une règle dont le texte contient {lien} nécessite un lien nominatif disponible.
Le transport e-mail utilise MAILER_DSN. Renseigner OVHCLOUD_DSN dans api/.env.local pour les SMS (voir la documentation du composant symfony/ovh-cloud-notifier). Le service Docker est défini, son démarrage pour des transmissions réelles nécessite l’autorisation de l’exploitant. Vérification sur la base de test avec transport simulé et deux passages du planificateur.

### Suivi en direct inspiré d’Edeliora
Le menu Suivi en direct reprend les cartes et la fiche de contact de VcLive et VcContactPanel. La route GET /api/live-presence/classes sert les créneaux en cours et les trente prochaines minutes. Actualisation toutes les cinq secondes. La synthèse des durées et l’historique Zoom restent accessibles sous les cartes. Les actions de contact Sofia nécessitent ROLE_SUIVI, vérifient la classe et le destinataire, puis journalisent le résultat. Un lien nominatif peut être copié pour son apprenant. Les relances groupées évitent de partager un lien nominatif.
Recette locale : 13 tests backend, 120 assertions, build/lint et 2 tests frontend. Vérification Chromium 1440 × 900 avec données fictives : carte, pastilles et ouverture de la relance groupée. Aucun envoi externe de recette.

### Inscriptions nominatives Zoom
La nouvelle migration conserve une ligne par couple créneau / inscription PS, avec unicité de l’identifiant Zoom dans la réunion et du lien personnel. Le formateur reste affecté au créneau. L’écran classe montre séparément l’inscription locale et le statut Zoom de chaque créneau. Le suivi et les rappels utilisent le lien associé au créneau.
Le service zoom-worker lance app:zoom:registrations après le provisionnement. Les résultats distants ambigus passent à « À vérifier » : contrôler dans Zoom avant de relancer. Recréer ce service lors du déploiement pour charger la nouvelle commande Compose. Les nouvelles réunions demandent à Zoom l’e-mail de confirmation du registrant.
Dans chaque application Zoom Marketplace, valider l’URL HTTPS publique /webhooks/zoom/{id-du-compte-local} avec le webhook_secret du profil. Souscrire à meeting.registration_created, meeting.registration_approved, meeting.registration_denied, meeting.registration_cancelled, meeting.participant_joined et meeting.participant_left. Autoriser l’ajout et la gestion des inscrits aux réunions pour le compte hôte. La présence s’appuie sur registrant_id quand Zoom le fournit. Les inscriptions externes sans PS correspondant ne créent pas de dossier apprenant.
Recette locale avec événements signés simulés : approbation, double livraison, arrivée sans email, annulation et rejet d’une approbation ancienne. L’activation Marketplace, la réception des invitations et la recette sur comptes Zoom réels restent à effectuer.

### Recette du worker Zoom avec deux PS
Un conteneur ponctuel zoom-worker a exécuté le test fonctionnel testWorkerAssignsPersonalLinksOnlyToLearners sur la base de test, avec un transport Zoom simulé. Les commandes réelles de provisionnement et de synchronisation associent deux liens distincts aux bons inscrits, laissent le formateur dans les affectations et gardent deux inscriptions après un second passage. 19 assertions réussies. La remise réelle des courriels par Zoom reste à vérifier. Le service permanent mis à jour n’a pas été relancé durant cette recette.

### Configuration des classes virtuelles par organisme
Paramétrage → Configurations des classes virtuelles permet aux administrateurs de partager une politique Zoom entre organismes et de sélectionner un pool de comptes hôtes. Le mode nominatif est systématique. Le compte sélectionné et la politique demandée sont figés lors de la réservation du créneau. Le worker enregistre les réglages remontés par Zoom, et une confirmation explicite que l’inscription automatique est désactivée place le créneau en vérification. Les organismes sans configuration utilisent le réservoir global et la politique par défaut. Archiver une configuration détache ses organismes et conserve les instantanés déjà enregistrés. Les secrets restent dans les profils serveur des comptes Zoom existants.
La migration Version20261124220000 a été appliquée aux bases locale, de test et du worker isolé. Recette simulée : validation des combinaisons, modification du profil après réservation, écart de salle d’attente signalé et deux liens PS distincts sans inscription du formateur. 14 tests PHPUnit et 2 tests frontend réussis. Le worker permanent reste sur la base de vérification sans accès Zoom.

### Connecteur OAuth Zoom
Dans Paramétrage → Comptes Zoom, un super administrateur enregistre une fois l’application OAuth Sofia puis peut connecter plusieurs comptes via le consentement Zoom. Enregistrer côté Zoom l’URL HTTPS /api/zoom-oauth/callback du domaine Sofia. Activer les autorisations de lecture du compte utilisateur, de liste des utilisateurs du compte et de gestion des réunions et inscrits pour les hôtes sélectionnés. Pour le suivi, utiliser /webhooks/zoom/oauth avec le jeton de signature saisi dans Sofia et les mêmes abonnements que pour les inscriptions nominatives historiques. La distribution aux comptes clients indépendants dépend de l’autorisation de l’application côté Zoom.
Les secrets et les jetons sont chiffrés. Conserver api/var/zoom-oauth.key sur un volume persistant accessible au backend et au worker, avec accès fichier restreint. Les hôtes importés entrent seulement dans le pool de l’organisme choisi. Si ce pool était partagé, Sofia crée une configuration dédiée en reprenant les réglages et les hôtes existants. Les autres organismes gardent leur configuration. La recette OAuth utilise des réponses Zoom simulées. La migration est appliquée. Le worker reste sur le réseau de vérification isolé.
