# HANDOFF — à lire en premier par toute IA qui reprend le projet

Lire dans l'ordre : `CLAUDE.md` (règles métier et conventions, font foi), `docs/cahier-des-charges.md`,
`docs/doc-technique.md` (modèle de données, Zoom, notifications), `docs/maquettes/planning.png`, puis `SUIVI.md`
(ce qui est fait / à faire). `HANDOFF.md` décrit l'état technique réel du dépôt, `SUIVI.md` l'avancement.

Après chaque demande concernant Sofia, mettre à jour ce handoff avant de répondre. Consigner les changements ou décisions, les vérifications réellement effectuées et les points qui restent à traiter. Garder les identifiants et secrets hors du handoff.

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
- Un compte FORMATEUR est lié à un `Trainer` (`User.trainer`, unique). Un compte de gestion peut aussi y être rattaché. L’accès se gère depuis la fiche formateur (voir « Accès formateur » en fin de document).
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

### Déploiement Coolify
Le fichier compose.production.yml construit Sofia avec le frontend et l’API sur un seul domaine et des volumes dédiés. Configurer le domaine https://sofia.mahdora.fr sur le service sofia, port 80. Renseigner APP_SECRET, POSTGRES_PASSWORD et DATABASE_URL dans Coolify. DATABASE_URL doit cibler le service database et utiliser le même mot de passe, encodé dans l’URL. MAILER_DSN est facultatif et laisse les envois désactivés par défaut. Les workers de provisionnement Zoom et de rappels restent hors de cette configuration initiale.

### Recette locale des sept pièces d’un organisme — 25 novembre 2026

Parcours vérifié dans Chromium à 1440 × 900, sur la pile Docker locale et la vraie API Sofia. Depuis **Organismes → Modifier → Documents**, la recette a utilisé un organisme dédié, trois images PNG distinctes (logo, signature et cachet) et quatre PDF distincts (Kbis, certificat Qualiopi, RIB et justificatif de déclaration d’activité).

| Étape | Vérification effectuée | Résultat |
|---|---|---|
| Ajout | Sélection des sept fichiers, enregistrement puis réouverture de la fiche | Les sept noms et contenus sont conservés. |
| Aperçus | Décodage des trois images dans le navigateur, avant et après enregistrement | Les dimensions de chaque aperçu correspondent au fichier choisi. |
| Téléchargement | Clic sur Télécharger pour chacun des quatre PDF | Le nom et les octets de chaque téléchargement correspondent à la source. |
| Remplacement | Remplacement des sept pièces par une seconde version distincte | Après enregistrement et réouverture, les aperçus et PDF correspondent à la seconde version. Les octets des sept fichiers servis par l’API ont aussi été comparés aux sources. |
| Annulation | Suppression du cachet, puis clic sur Annuler et réouverture | Les sept pièces sont toujours présentes. |
| Suppression | Retrait des sept pièces puis enregistrement | Avant validation, l’API liste encore les sept pièces. Après réouverture, les sept emplacements sont vides, la liste API est vide et les sept anciennes URL renvoient HTTP 404. |

L’organisme et le compte temporaires ont été supprimés après la recette. Le test automatisé complémentaire est `ReferentialsTest::testOrganizationProfileAndPrivateDocument`. Il couvre notamment le contrôle d’accès, la conservation d’une pièce pendant une modification du profil et son retrait explicite.

La migration `Version20261125000000` crée les tables de profil et de documents. La limite d’envoi prévue est de 5 Mo par pièce et de 40 Mo par requête multipart.

### Suppression logique et confirmation dans Organismes — 25 novembre 2026

- Dans **Organismes**, la confirmation s’ouvre au centre de l’écran. Le bouton **Supprimer** est rouge. Le titre de page et la confirmation utilisent des pictogrammes vectoriels Lucide. Un espace de 8 px sépare la corbeille du libellé du bouton.
- La migration `Version20261125010000` ajoute `deleted_at` aux organismes, formations, formateurs, créneaux et documents d’organisme. Les fiches supprimées quittent les listes et restent en base avec leurs associations historiques. Une suppression de fiche est enregistrée dans le journal d’audit avec l’action `DELETE`.
- Migration appliquée à la base locale. Sur une base de test isolée, les 16 tests PHPUnit passent avec 196 assertions. Le build et le lint frontend passent. Chromium a confirmé le centrage, les pictogrammes, l’espacement du bouton, l’annulation et la suppression d’un organisme fictif à 1440 × 900 et 1920 × 1080.
- Les corrections sont dans le dépôt local. Le commit et le déploiement de ces corrections restent à faire.

### Étape Identification de la création d’un organisme — 25 novembre 2026

- La carte blanche occupe toute la colonne du formulaire. Le bouton Continuer est davantage en retrait du bord droit. Les listes déroulantes natives ont un chevron visible et le statut utilise un point coloré.
- Le champ facultatif « SIREN ou SIRET » accepte 9 ou 14 chiffres en création et en édition. Le formulaire et l’API du profil retirent les espaces. La colonne et la clé API `siret` sont conservées et acceptent déjà cette longueur.
- Chromium a vérifié la carte, le bouton et la validation à 1440 × 900, 1920 × 1080 et 390 × 844. Sur l’API Docker locale, les créations avec champ vide, SIREN et SIRET ont abouti. Un numéro de 10 chiffres a été refusé et la modification permet d’effacer la valeur. Les organismes fictifs ont été retirés par suppression logique.

### Navigation de la création d’un organisme

- En haut du formulaire, le lien « ← Organismes » revient à la liste. Sur grand écran, le panneau de droite affiche les cinq étapes et met en évidence l’étape en cours. Quand la largeur de la page de création est de 840 px ou moins, le panneau laisse place à un indicateur « Étape 1 sur 5 · Identification » qui suit la navigation.
- Vérifié dans Chromium en local à 1440 × 900 et 1920 × 1080 pour le panneau latéral et à 390 × 844 pour l’indicateur compact. Les boutons Continuer et Retour ont fait avancer puis reculer l’indicateur. Le lien Organismes a ramené à la liste. Build et lint frontend réussis.

### Ancien fonctionnement du brouillon local

- Le bouton « Enregistrer en brouillon » sauvegarde sur demande l’étape, les champs et les pièces déjà jointes dans IndexedDB. Chaque utilisateur dispose d’un brouillon sur ce navigateur pour cette adresse Sofia. Un nouvel enregistrement remplace le précédent.
- Au retour sur « Créer un organisme », Sofia restaure la dernière sauvegarde du même utilisateur sur le même navigateur. Le brouillon n’apparaît pas dans la liste des organismes et ne se synchronise pas avec un autre navigateur. Après une création réussie, Sofia efface le brouillon local.
- Fonctionnement confirmé par lecture du code du formulaire et de son stockage. Aucun changement fonctionnel.

### Statut Brouillon et hauteur du formulaire

- « Enregistrer en brouillon » crée ou met à jour un brouillon dans la base PostgreSQL Docker de Sofia, puis revient à la liste des organismes. Le statut Brouillon, son filtre et le lien Reprendre sont visibles pour le compte propriétaire. Plusieurs brouillons peuvent être enregistrés. Le brouillon contient l’étape, les champs et les pièces et reste accessible depuis un autre navigateur avec le même compte. Un ancien brouillon local peut être repris puis enregistré côté serveur.
- La migration `Version20261125020000` crée le stockage des brouillons. La création de l’organisme et la fermeture datée du brouillon sont effectuées dans la même transaction. Les brouillons ouverts restent hors des sélecteurs opérationnels. La documentation Supabase a servi de référence PostgreSQL. Sofia utilise sa base Docker existante.
- Les cartes suivent la hauteur du contenu. Le pied du formulaire se trouve près des champs même lorsque le guide latéral est plus haut.
- Recette Chromium locale à 1440 × 900 puis dans une nouvelle session à 390 × 844. Enregistrement incomplet, affichage du statut et filtre, reprise, restauration des sept pièces puis création finale vérifiés. Migration appliquée en local et sur la base de test isolée. Build et lint frontend réussis. PHPUnit passe avec 17 tests et 208 assertions, dont les contrôles entre comptes et la conservation du brouillon si la création échoue.

### Description à transmettre à Codex

Le brouillon est un état du parcours de création d’un organisme. Il conserve l’étape, les champs et les pièces dans PostgreSQL local via Docker. Le compte propriétaire le retrouve via le statut Brouillon dans la liste des organismes. Une création réussie ferme le brouillon dans la même transaction. La documentation Supabase a servi uniquement de référence PostgreSQL. Aucun compte ni service Supabase n’est nécessaire.

### Aide du champ Code

Dans l’étape Identification, une aide visible sous le champ Code explique qu’il s’agit de l’identifiant unique de l’organisme. Elle donne SOF en exemple et rappelle le format accepté. L’aide est associée au champ via `aria-describedby`. Build et lint frontend réussis.

### Fond blanc, code APE et aides à la saisie

Les cinq étapes de création utilisent des cartes blanches. Chaque champ et chaque emplacement de pièce affiche une courte description. Le code APE est facultatif dans Identification et disponible en édition. Le stockage existant du profil et des brouillons accepte déjà ce champ.

Chromium à 1440 × 900 a vérifié le fond des cartes, les aides des champs et des sept pièces, ainsi que l’enregistrement du code APE dans le brouillon. La reprise du brouillon à 390 × 844 a confirmé l’affichage des aides des sept pièces. Build, lint et contrôle du diff réussis.

### Champ Fonction dans Coordonnées

Le champ « Fonction » désigne le poste de la personne renseignée juste avant dans « Responsable de l’organisme ». Le formulaire de création le demande actuellement comme champ obligatoire. Cette clarification ne change pas le formulaire.

### Retrait du champ Fonction

Le champ « Fonction » a été retiré de Coordonnées en création et en édition. La définition des champs est partagée entre les deux formulaires. Le responsable de l’organisme reste disponible. Build et lint frontend réussis.

### Champ Conditions de paiement

Dans Facturation, ce champ indique le délai de règlement convenu. Il est obligatoire dans l’assistant de création. Le profil et les brouillons le conservent. Le code actuel ne l’utilise pas pour calculer des échéances ou générer des factures. Vérification par lecture du code.

### Retrait des conditions de paiement

« Conditions de paiement » a été retiré de Facturation en création et en édition. Les autres champs servent à renseigner le profil et les brouillons. La recherche dans le code n’a trouvé aucun usage pour générer des factures, calculer la TVA, envoyer les factures ou lancer des paiements. Build et lint frontend réussis.

### Préremplissage de la facturation

À la création d’un organisme, Facturation reprend la raison sociale depuis Identification et l’adresse avec son complément, le code postal, la ville, l’e-mail et le téléphone depuis Coordonnées. Un champ suit la valeur d’origine jusqu’à sa modification manuelle. Les modifications manuelles sont conservées dans le brouillon. À la création finale, les valeurs affichées sont envoyées à l’API. TVA, IBAN et BIC restent à saisir selon les besoins du formulaire.

Recette Chromium locale à 1440 × 900. Les six valeurs ont été reprises. Une modification de la ville dans Coordonnées a été répercutée et une adresse de facturation personnalisée a été conservée après retour et reprise du brouillon. Build et lint frontend réussis.

### Facturation facultative

Tous les champs de l’étape Facturation sont facultatifs à la création. Le préremplissage reste disponible et les valeurs peuvent être modifiées ou effacées. Le build et le lint frontend passent.

### Avis sur l’étape Communications

L’écran regroupe les réglages d’expédition, les contacts et les préférences. L’adresse d’envoi et l’expéditeur SMS sont exploités par les envois existants. L’aperçu affiche l’adresse de réponse. Les préférences et le contact de communication sont conservés dans le profil. Une simplification de l’étape ou le déplacement des réglages avancés vers la fiche organisme reste à décider.

### Communications simplifiées à la création

L’étape conserve l’e-mail d’envoi, prérempli depuis l’e-mail de contact et modifiable, et l’expéditeur SMS, facultatif. L’aperçu affiche les expéditeurs avec les valeurs du formulaire. L’e-mail de réponse, le contact dédié et les préférences ont été retirés de la création et restent disponibles en édition. Build et lint frontend réussis.

### Aperçu des messages de l’organisme

Dans Communications, l’aperçu présente un exemple d’e-mail avec son expéditeur, son objet et son corps, ainsi qu’un exemple de rappel SMS. Le nom de l’organisme et les expéditeurs se mettent à jour pendant la saisie. Build et lint frontend réussis.

### Logo seul obligatoire dans l’assistant

Le formulaire de création exige uniquement le logo à l’étape Documents. La signature, le cachet, le Kbis, le certificat Qualiopi, le RIB et le justificatif de déclaration d’activité sont facultatifs. Les libellés de création l’indiquent. La fiche en édition permet de gérer les pièces existantes sans afficher d’astérisques trompeurs.

Dans Chromium, la création a été bloquée sans logo puis a réussi avec un logo seul. L’API a confirmé la présence d’une seule pièce. Build, lint et contrôle du diff réussis.

### Couleur d’identification à la création

Identification propose les mêmes couleurs que la fiche en édition. Bleu SOFIA est la valeur par défaut. Violet Phocea et Gris sont également disponibles. La couleur passe par le stockage existant du brouillon et du profil. Build et lint frontend réussis.

### Sélecteur visuel de couleur

Dans Identification à la création, trois boutons radio affichent la pastille et le nom de la couleur. Une coche et un contour distinguent le choix actif. Le sélecteur conserve la navigation clavier native. Build et lint frontend réussis.

### Identité visuelle commune à la création et à l’édition

L’étape Documents de création réutilise le bloc Identité visuelle de l’édition pour le logo, la signature et le cachet. Chaque carte affiche l’aperçu, le nom, le format, la taille et les actions d’ajout, de remplacement et de suppression. Les visuels acceptent le glisser-déposer. Le logo reste la seule pièce obligatoire à la création.

Build et lint réussis. En Chromium, reprise mobile d’un brouillon avec sept pièces, décodage de l’aperçu du logo, retrait et blocage de la création, nouvel ajout et création avec les sept pièces vérifiés.

### Création validée et édition harmonisée

La création validée a été commitée localement dans `9744059`, avec les changements de liste et d’API dont elle dépend. La configuration locale sensible reste hors de ce commit.

La fiche d’édition partage les champs visibles, leurs aides et le sélecteur visuel de couleurs avec la création. Le code de l’organisme reste en lecture seule en édition. Les panneaux du formulaire sont blancs. L’aperçu prend la teinte de la couleur sélectionnée et affiche à côté du nom le badge Actif en vert ou Inactif en gris. Les réglages supplémentaires de l’ancienne fiche restent conservés dans le profil enregistré.

Recette Chromium locale à 1440 × 900 et 390 × 844. Les aides, les fonds, le badge, la couleur de l’aperçu et la persistance du statut et de la couleur ont été vérifiés. Build et lint frontend réussis. L’harmonisation de l’édition est dans le dépôt local en attente de validation.

### Confirmation de suppression d’un organisme

La liste et l’édition partagent la même fenêtre centrée. Le texte précise le retrait de la liste, la conservation de l’historique et la trace dans le journal d’audit. La liste affiche le nombre de classes rattachées lorsqu’il est connu et propose la désactivation pour un organisme actif. Annuler reçoit le focus à l’ouverture. Les actions sont bloquées pendant la requête et les erreurs apparaissent dans la fenêtre.

Build et lint réussis. Chromium a vérifié le centrage, la fermeture clavier et le focus en édition à 1440 × 900 et 390 × 844. Dans la liste, centrage, bouton rouge, annulation et suppression logique d’un organisme fictif ont été vérifiés à 1440 × 900 et 1920 × 1080.

### Confirmation renforcée de suppression

Depuis la liste et la fiche d’édition, la fenêtre affiche au centre un avertissement et le nombre de classes rattachées lorsque le total est positif. L’édition utilise le même total API que la liste. La saisie du nom exact active le bouton de confirmation. « Désactiver » est également disponible depuis l’édition pour un organisme actif. Le texte décrit la suppression logique et la conservation de l’historique.

Build et lint réussis. Chromium a vérifié le nombre en édition avec un total de test simulé, le centrage, la fermeture clavier, le refus d’un nom incorrect et la suppression logique d’un organisme fictif avec le nom exact.

### Liste des organismes et vue tableau

Le focus de la recherche et du statut apparaît discrètement autour du filtre et reste visible au clavier. La vue tableau affiche le nom, le code, le statut, le nombre de classes et les actions, avec des lignes pour les brouillons. En l’absence de résultats, un panneau propose de réinitialiser les filtres. En l’absence d’organismes, il propose la création aux administrateurs. Le compteur est masqué quand aucun organisme publié ne correspond.

Chromium a vérifié le focus, le passage de cartes à tableau, l’état filtré vide, la réinitialisation et l’absence de débordement horizontal de la page à 390 × 844. Build et lint frontend réussis.

### Lisibilité de la vue tableau des organismes

La vue tableau utilise des lignes légèrement alternées, un code mis en évidence, des nombres de classes alignés et des actions compactes. Les boutons d’action gardent des libellés accessibles et une infobulle. Build et lint frontend réussis.

### Visibilité de la pagination des organismes

La liste pagine les organismes par groupes de dix. Les boutons de pagination s’affichent lorsqu’il existe une deuxième page. Le compteur est visible dès le premier organisme trouvé. Ce comportement est partagé par les vues cartes et tableau. Vérification par lecture du code.

### Validation de la page Organismes

L’utilisateur a validé la page Organismes le 25 novembre 2026 après les ajustements de la liste, de la vue tableau, de la pagination, de la fiche d’édition et de la confirmation de suppression. La création avait déjà été validée et commitée localement dans `9744059`. Les changements d’édition et de liste restent à commiter.

### Protection du parcours Organismes validé

Toute modification du parcours Organismes (liste, vues cartes et tableau, création, brouillons, édition et suppression) exige une demande explicite de l’utilisateur. Lors d’un changement ailleurs dans Sofia, vérifier les régressions sur ce parcours si des composants, styles ou API partagés sont touchés. Si une correction implique de modifier le parcours, signaler le problème et attendre une demande explicite.

### Déconnexion depuis le menu de compte

Le pare-feu Symfony ferme la session et l’API de déconnexion répond directement avec HTTP 204. Le menu indique la requête en cours, bloque les clics répétés et affiche un message en cas d’échec. Après succès, le frontend annule les requêtes en cours, vide les données de compte mises en cache et affiche le formulaire de connexion.

Build et lint réussis. Depuis Organismes dans Chromium local, déconnexion HTTP 204, formulaire après rechargement, refus HTTP 401 de l’API de session et reconnexion avec retour à la liste vérifiés. Les sources du parcours Organismes n’ont pas été modifiées pour ce correctif.

### Logo de la barre latérale

La barre latérale commune affiche le PNG fourni par l’utilisateur, avec ses dimensions et sa transparence d’origine. La hauteur suit la largeur définie par la navigation sur ordinateur et mobile. Le PNG du build correspond à l’original. Build et lint frontend réussis.

### État vide de la liste des utilisateurs

Le panneau « Aucun résultat pour ce filtre » s’affiche uniquement quand le résultat filtré est vide. Lorsqu’il y a des utilisateurs, le tableau et sa pagination s’affichent. Build et lint frontend réussis.

### Pictogrammes et contrôles de la liste des utilisateurs

L’état vide utilise une icône vectorielle. Les boutons d’action et de réinitialisation reprennent les dimensions de Formations. La règle commune des listes déroulantes adopte un contour de focus discret sur les écrans Sofia, avec un repère visible au clavier. Le parcours Organismes garde ses styles validés. Build et lint frontend réussis.

Chromium local a confirmé le pictogramme SVG dans l’état vide, les mêmes dimensions calculées pour le bouton Modifier dans Utilisateurs et Formations, le focus discret des sélecteurs sur ces deux écrans et le focus validé sur Organismes.

### Alignement des filtres Utilisateurs

Les sélecteurs utilisent le chevron Lucide de la création d’organisme. Les sélecteurs, la recherche et le bouton Réinitialiser ont une hauteur commune de 42 px. Build et lint frontend réussis.

### Chevron commun des listes déroulantes

Les sélecteurs simples de Sofia utilisent le même chevron Lucide de 16 px que les filtres Utilisateurs et le formulaire Organismes. Les composants qui ont déjà leur chevron gardent leur rendu. Les listes à choix multiples conservent leur présentation native. Build et lint frontend réussis.

### Badges du tableau Utilisateurs

Les rôles et les statuts utilisent des pictogrammes Lucide de 15 px. Super Admin a une couronne violette, Admin un bouclier bleu, Actif une coche verte et Inactif un cercle gris avec un tiret. Build et lint frontend réussis.

### Pictogrammes communs d’activation

Utilisateurs, Formations, Formateurs, Organismes et Modèles de messages partagent les mêmes pictogrammes de statut. Actif utilise une coche cerclée et Inactif un tiret cerclé. Activer utilise un cercle avec un triangle et Désactiver un cercle avec une pause. L’application à Organismes répond à la demande explicite d’harmonisation des pictogrammes sur tout Sofia. Build, lint et recettes Chromium de la liste Organismes et des écrans Utilisateurs et Formations réussis.

### Alignement du bouton Supprimer dans Utilisateurs

L’icône et le libellé de Supprimer sont centrés dans le bouton du tableau Utilisateurs. Build et lint frontend réussis.

### Alignement vertical des actions Utilisateurs

La colonne Actions réserve 294 px sur la vue tableau à largeur fixe. Les boutons Activer et Désactiver occupent le même emplacement, ce qui aligne les boutons Supprimer d’une ligne à l’autre. Build et lint frontend réussis.

### Style partagé des tableaux Organismes et Utilisateurs

À la demande de l’utilisateur, la vue tableau d’Organismes reprend le style de tableau Utilisateurs et ses actions libellées Modifier, Activer ou Désactiver et Supprimer. Les deux tableaux partagent la grille d’actions pour aligner les boutons verticalement. La vue cartes conserve ses contrôles. Build et lint frontend réussis.

Chromium local a vérifié la vue tableau des organismes, la réinitialisation des filtres et l’absence de débordement horizontal de la page à 390 × 844.

### Largeur des actions dans Utilisateurs

La colonne intermédiaire des actions du tableau Utilisateurs a une largeur fixe de 104 px et son bouton occupe toute la largeur. Activer et Désactiver ont ainsi le même encombrement. Build et lint frontend réussis.

### Largeur des actions dans Organismes

La vue tableau Organismes partage avec Utilisateurs la largeur fixe de 104 px pour Activer et Désactiver, ce qui aligne Supprimer entre les lignes. Build et lint frontend réussis.

### Avis sur la maquette de création utilisateur

Le passage à une page dédiée suivrait le modèle d’Organismes. La structure proposée sépare l’identité et les accès. L’aperçu des permissions devrait refléter les droits réels du rôle en lecture seule. La photo, le téléphone et la fonction nécessiteraient un besoin métier et un stockage dédié. Un éventuel envoi d’invitation devrait utiliser un lien de définition du mot de passe. Avis donné sans changement du formulaire.

### Cadrage des comptes et droits par organisme

Le super administrateur a un accès global aux organismes et aux données, avec la possibilité de filtrer par organisme. Les comptes utilisateurs sont des comptes de gestion avec des rôles. Un compte restreint à un organisme ne peut lire, créer, modifier ou rattacher des données qu’au sein de cet organisme, selon son rôle. Les onglets sans autorisation sont masqués et les mêmes règles sont appliquées aux routes et à l’API. Un apprenant est un participant inscrit à une classe, distinct d’un compte utilisateur de gestion. Le compte formateur possède déjà un parcours séparé vers ses classes.

Le rattachement organisme et la hiérarchie des rôles existent. Le contrôle par organisme reste à mettre en œuvre de manière systématique dans les lectures, les mutations et les relations. Ce cadrage n’a pas modifié le code applicatif.

### Formation, classe virtuelle et e-learning

La formation est l’offre pédagogique principale. Une classe virtuelle (CV) est une session programmée rattachée à une formation. Dans ce parcours, l’apprenant s’inscrit à la CV de la formation et reçoit son lien nominatif pour cette session. Une formation peut aussi être proposée en e-learning. Les modalités peuvent coexister dans le catalogue. Le parcours d’inscription e-learning et les éventuelles formations mixtes restent à préciser. Les droits d’accès suivent l’organisme de la formation. Cadrage métier, sans modification du code.

### Page dédiée de création d’un utilisateur

Depuis Utilisateurs, « Ajouter un utilisateur » ouvre `/settings/users/new`, réservée au super administrateur. La maquette est reprise avec les cartes Informations générales et Accès et rôle, un aperçu du profil par initiales et les permissions du rôle en lecture seule. La création utilise l’API existante, avec mot de passe de 12 caractères minimum. Un super administrateur n’a pas d’organisme de rattachement. Pour les autres rôles, le formulaire demande un organisme et, pour le rôle Formateur, un formateur lié. Le cloisonnement des comptes de gestion par organisme reste à implémenter côté serveur et le formulaire le signale. Photo, téléphone, fonction et envoi des accès restent hors de cette première version.

Chromium local a vérifié l’ouverture depuis la liste, l’aperçu des rôles, l’apparition du champ formateur, l’affichage à 390 × 844 ainsi que la création d’un compte fictif inactif et son retour dans la liste. Build et lint frontend réussis.

### Création utilisateur · rattachements multiples et première connexion

Le formulaire propose des aides sous les champs, le téléphone et la fonction facultatifs, plusieurs organismes, et deux modes de remise du mot de passe temporaire (e-mail ou saisie visible pour remise manuelle). La migration Version20261125030000 reprend les rattachements existants. Les comptes créés par le formulaire doivent choisir un mot de passe personnel avant tout accès métier. La liste affiche et filtre les rattachements multiples. La restriction de toutes les données métier par organisme reste un chantier distinct.

Recette locale via API avec comptes techniques example.test : création, restitution des rattachements, invitation reçue dans Mailpit, connexion temporaire, refus HTTP 403 avant renouvellement puis lecture autorisée après changement. Build front réussi. Diffusion réelle via MAILER_DSN et lien via SOFIA_FRONT_URL. Pas de test visuel de cette révision, ni de déploiement.

### Sélecteur d’organismes et photo utilisateur

La création utilise une liste déroulante filtrable à sélection multiple. Les organismes sélectionnés restent visibles et peuvent être retirés individuellement. La photo facultative JPG ou PNG de 2 Mo maximum peut être prévisualisée, remplacée et retirée avant création. Elle est enregistrée avec le compte et affichée dans le bandeau de l’utilisateur connecté. Migration Version20261125040000 appliquée en local. Build front réussi et persistance de la photo vérifiée via l’API après connexion d’un compte technique.

### Carte Profil utilisateur

Présentation alignée sur la référence de création : avatar circulaire avec crayon superposé, intitulé Photo de profil et indication du format au-dessus du bouton Choisir un fichier.

### Administration, rôles personnalisés et périmètre des organismes

La barre latérale regroupe Organismes, Utilisateurs, Rôles et permissions, Configurations des classes virtuelles et Comptes Zoom sous Administration. Les comptes ont un seul rôle et plusieurs rattachements possibles. Chaque permission du rôle s’applique à tous les organismes rattachés. Les actions qui dépendent d’autres rubriques activent aussi leurs permissions de lecture.

Le super administrateur a un accès global. La gestion des utilisateurs, des rôles et comptes Zoom, la création d’organismes et les référentiels transversaux restent réservés au super administrateur. Les autres comptes voient les rubriques permises par leur rôle. Le tableau de bord des comptes rattachés présente leurs prochaines classes avec un filtre d’organisme. Le rôle système Formateur conserve son accès par affectation de créneau.

L’API contrôle indépendamment les permissions et le périmètre. Les listes, les accès par identifiant et les rattachements tiennent compte des organismes. Une configuration partagée entre plusieurs organismes peut être modifiée par un utilisateur seulement si tous ces organismes sont dans son périmètre. Les modifications de rôle et de rattachement sont prises en compte par l’API dès la requête suivante. La navigation charge les droits depuis la session.

Migration Version20261125050000 appliquée en local. Recette Chromium à 1440 × 900 sur les vrais écrans locaux avec un rôle créé puis attribué à deux organismes. Recette API de lecture, modification des droits et refus des rattachements externes. Suite PHPUnit sur une base isolée (18 tests, 217 assertions), build, tests et lint front réussis.

### Gestion simplifiée des rôles

Écran en deux colonnes avec indicateurs, liste recherchable des rôles système et personnalisés, filtre par type et formulaire. Chaque rubrique présente un interrupteur. Les actions associées sont déduites des rubriques actives et de leurs dépendances. Renommer un ancien rôle seul conserve ses permissions. Recette Chromium à 1440 × 900 avec création d’un rôle Planning et attribution à deux organismes. Build et lint réussis.

### Filtres et état vide des rôles

La recherche, le type et le nom du rôle utilisent un focus discret. Une recherche sans résultat remplace le tableau par le panneau utilisé sur Organismes avec un pictogramme et une action qui réinitialise les deux filtres.

### Reprise après Codex — rôle Formateur à la création d’un utilisateur (25 novembre 2026)

- Consigne de l’utilisateur : consigner les choix validés dans ce handoff à la fin de chaque demande.
- Question posée : pourquoi « Formateur » est proposé sur `/settings/users/new`. Il s’agit du rôle `ROLE_FORMATEUR` (commit `9086918`) : compte lié à une fiche Formateur, limité à « Mes classes ». Il ne fait pas partie des quatre rôles de `CLAUDE.md`.
- Décision en attente : conserver ce rôle à la création ou le retirer. Aucun code modifié.
- Constat par lecture du code : la liste « Formateur lié » écarte les formateurs sans organisme, que l’API accepte.
- Orientation exprimée par l’utilisateur : « Utilisateurs » désigne les comptes de gestion (back-office), distincts des formateurs. La création d’un formateur devrait créer son accès, avec le rôle Formateur limité à « Mes classes » (extensible plus tard).
- Proposition faite, à valider avant tout code : case « Créer l’accès à Sofia » cochée par défaut sur la fiche formateur ; rôle Formateur retiré du formulaire et de la liste Utilisateurs ; compte géré depuis la fiche formateur (activer, désactiver, renvoyer l’accès) ; désactivation ou suppression du formateur = accès coupé ; e-mail déjà utilisé par un compte = aucun accès créé, avec message. Le parcours Organismes reste inchangé.
- Retour de l’utilisateur : la proposition d’accès formateur est à ajuster ; points à préciser. Rien n’est validé ni développé.
- Besoin confirmé par l’utilisateur : un administrateur peut aussi être formateur (même e-mail).
- Proposition à valider : un seul compte par e-mail, le rôle de gestion est conservé et la fiche formateur y est rattachée. « Mes classes » s’ouvre à tout compte rattaché à une fiche formateur. Désactiver ou supprimer la fiche retire ce rattachement sans couper l’accès de gestion ; un compte uniquement formateur est désactivé. Impacts repérés : `User::validateTrainer`, contrôle d’organisme dans `UserProcessor` (super admin sans organisme), `MyClassesController`, menu et routage dans `App.tsx` / `Layout.tsx`.

### Accès formateur — validé et développé le 25 novembre 2026

Décisions validées par l’utilisateur (elles remplacent les propositions ci-dessus) :
- « Utilisateurs » = comptes de gestion. Le rôle Formateur est retiré du formulaire de création, du filtre et de la liste Utilisateurs ; il reste visible dans Rôles et permissions.
- Fiche formateur : case « Créer l’accès à Sofia » cochée par défaut à la création, invitation par e-mail avec mot de passe temporaire. En modification : créer, renvoyer, activer ou désactiver l’accès.
- Un seul compte par e-mail : un compte de gestion existant est rattaché à la fiche, garde son rôle et son mot de passe, et voit « Mes classes » en plus.
- Fiche désactivée ou supprimée : le compte uniquement formateur ne peut plus se connecter (réactiver la fiche le rétablit) ; le compte de gestion perd seulement « Mes classes ».
- Le nom, l’e-mail et l’organisme d’un compte uniquement formateur suivent la fiche.
- Choix technique : la gestion de l’accès demande le droit « Gérer les formateurs » sur l’organisme de la fiche.

API : `GET /api/trainer-accounts`, `POST|PATCH /api/trainers/{id}/access`, `AccessMailer` partagé avec la création d’utilisateur, `me.trainer`. Pas de migration.

Vérifications : PHPUnit 19 tests, 233 assertions sur une base créée puis supprimée pour l’occasion ; lint, 2 tests et build frontend. Recette navigateur locale en super admin : création avec accès, désactivation, rattachement d’un compte existant, menu « Mes classes », liste des rôles à la création d’utilisateur. Données de recette désactivées ensuite.

Restes ouverts : en production l’envoi est refusé tant que `MAILER_DSN` n’est pas configuré ; réception du mail non contrôlée dans Mailpit à l’écran ; parcours d’un administrateur non super admin non recetté au navigateur ; PHPStan signale 36 erreurs de typage, aucune sur les fichiers ajoutés ; la base `app_test` locale n’est plus à jour des migrations ; la base de développement contient de nombreux comptes et rôles « Recette » antérieurs ; rien n’est commité.

### Se connecter en tant que — 25 novembre 2026

- Demande de l’utilisateur : ajouter l’option dans Utilisateurs et Formateurs. Bouton (icône) dans la colonne Actions des deux listes.
- Règles retenues par défaut, à confirmer par l’utilisateur : réservé au super admin ; impossible vers un super admin, un compte désactivé ou depuis une connexion déjà empruntée ; les droits sont ceux du compte emprunté ; le mot de passe temporaire n’est ni demandé ni modifiable ; bandeau « Revenir à mon compte ».
- Journal d’audit : début et fin tracés ; toute entrée écrite pendant l’emprunt porte l’auteur réel, avec le compte emprunté dans `onBehalfOf`. Les autres traces d’auteur (`MessageLog`) portent le compte emprunté.
- API : `POST /api/auth/impersonate/{id}` et `POST /api/auth/impersonate/exit` (`SwitchUserToken`), `me.impersonator`. Pas de migration.
- Vérifications : PHPUnit 20 tests, 244 assertions sur base temporaire ; lint, 2 tests et build frontend ; recette navigateur en 1440 × 900 depuis les deux listes, avec retour au compte d’origine. Comptes de recette désactivés. Rien n’est commité.
- À noter : la colonne Actions d’Utilisateurs passe de 294 à 344 px ; en fenêtre étroite elle demande un défilement horizontal. Organismes inchangé.
- Validé par l’utilisateur le 25 novembre 2026 : « Se connecter en tant que » reste réservé au super admin (cette règle n’est plus à confirmer).

### Fiche utilisateur en modification — 25 novembre 2026

- Demande de l’utilisateur : la fiche « Modifier » doit ressembler à « Créer ».
- `/settings/users/:id/edit` réutilise le formulaire de création (mêmes cartes, aides, photo, aperçu des permissions). L’ancien formulaire générique des utilisateurs est retiré.
- Différences : pas de bloc « Envoi des accès » ni de mot de passe ; rôle et statut verrouillés sur son propre compte ; nom de famille facultatif en modification (anciens comptes à un seul mot). Comme à la création, un compte hors super admin exige au moins un organisme pour être enregistré.
- La photo est lue sur la fiche seule (`GET /api/users/{id}`), jamais dans la liste.
- Non fait : changement ou renvoi du mot de passe d’un compte de gestion existant.
- Vérifications : PHPUnit 21 tests, 250 assertions ; lint, 2 tests et build ; recette navigateur : ouverture préremplie, rattachement à SOFIA et fonction enregistrés. Comptes de recette désactivés. Rien n’est commité.

### Renvoi du mot de passe temporaire — 25 novembre 2026

- Demande de l’utilisateur : renvoi depuis la fiche utilisateur en modification (remplace le « Non fait » ci-dessus).
- Bouton avec confirmation dans « Accès et rôle » ; e-mail à l’adresse enregistrée, ancien mot de passe invalidé, changement exigé à la connexion suivante. Réservé au super admin ; refusé sur son propre compte et sur un compte désactivé. Envoi par e-mail uniquement (pas de remise manuelle).
- API : `POST /api/users/{id}/access` ; logique d’invitation partagée avec les formateurs dans `AccessMailer::invite`, tracée `ACCESS_SENT`.
- Vérifications : PHPUnit 22 tests, 257 assertions ; lint, 2 tests, build ; recette navigateur avec réception dans Mailpit. Rien n’est commité.

### Pagination des rôles — 25 novembre 2026

- Demande de l’utilisateur : paginer le tableau de Rôles et permissions.
- 10 par page par défaut (10, 25 ou 50), compteur et boutons Précédent / Suivant ; la recherche, le filtre de type et la réinitialisation reviennent à la page 1.
- Vérifications : lint, 2 tests et build ; recette navigateur du passage en page 2. Compte de recette désactivé. Rien n’est commité.

### Commit — 25 novembre 2026

- À la demande de l’utilisateur, tout le travail en attente (reprise de Codex et sessions du 25 novembre) est commité en un seul commit sur la branche `feat/comptes-roles-acces-formateur`. Ni poussé, ni fusionné dans `main`, ni déployé. Les mentions « non commité » plus haut sont closes par ce commit.
- Fusionné ensuite dans `main` (avance rapide) à la demande de l’utilisateur. Non poussé et non déployé.
- Dépôt distant : `https://github.com/Kirito-elysim/sofia-dpc` (remote `origin`). L’utilisateur a demandé le 25 novembre 2026 de pousser `main`, après avoir été averti que le dépôt est public. Reste conseillé : le passer en privé et contrôler les valeurs des fichiers `api/.env*` suivis.

### Page Formateurs — état vide et notes de maquette (25 novembre 2026)

- Demandes de l’utilisateur : « Aucun résultat pour ce filtre » doit être dans le tableau ; retirer les blocs « 3 points d’ergonomie » et « Questions ouvertes » des formateurs.
- L’état vide est une ligne du tableau, affichée seulement sans résultat (même composant sur Formations, qui l’affichait en permanence sous le tableau). Les notes sont retirées de Formateurs ; Formations garde les siennes.
- Les questions ouvertes retirées de l’écran restent à trancher si besoin : fiche formateur détaillée, disponibilités, limitation par organisme, liste des spécialités.
- Vérifications : lint, 2 tests, build ; recette navigateur de Formateurs (liste vide) et Formations. Non commité.

### Tableau Formateurs aligné sur Organismes — 25 novembre 2026

- Demande de l’utilisateur : un tableau similaire aux autres, comme Organismes.
- Formateurs et Formations (composant commun) utilisent le style `od-table`, les actions libellées Modifier, Activer ou Désactiver et Supprimer avec la grille partagée, et le panneau vide d’Organismes, placé dans le tableau. Formateurs garde l’icône « Se connecter en tant que ». Le parcours Organismes n’est pas modifié.
- Vérifications : lint, 2 tests, build ; recette navigateur de Formateurs en 1440 × 900, vide et avec une fiche fictive (retirée ensuite). Non vu à l’écran : Formations après ce changement et la fiche latérale ouverte. Non commité.

### Page formateur d’après la maquette — 25 novembre 2026

Choix de l’utilisateur :
- Intégrer la maquette « Créer un formateur » sans toucher à la barre de navigation ; pas de « Formations assurées » ni de « Créneaux d’intervention habituels ».
- **Habilitation par formation supprimée** : un formateur peut animer toutes les formations de ses organismes. La planification contrôle l’organisme (remplace la règle « formateur habilité »).

Livré :
- `/settings/trainers/new` et `/settings/trainers/:id/edit` (la fiche latérale des formateurs est retirée ; la gestion de l’accès est sur la page de modification).
- Formateur rattaché à plusieurs organismes ; profession, RPPS/ADELI, formats, biographie, notes internes, photo, date de mise à jour ; documents CV, convention et signature (PDF, JPG, PNG, 5 Mo).
- Un compte restreint voit un formateur partagé, mais ne peut le modifier, le supprimer, gérer son accès ou lire ses documents que si tous ses organismes sont dans son périmètre.
- Migration `Version20261125060000`, appliquée en local. Elle reprend l’ancien organisme et ceux des anciennes formations habilitées. `trainer.organization_id` et `trainer_training` restent en base, inutilisés.

Écarts avec la maquette : « Type d’intervention » non affiché (aucune donnée) ; civilité conservée en base mais absente de la page. Organisme et format sont exigés par l’écran, pas par l’API.

Vérifications : PHPUnit 23 tests, 267 assertions ; lint (un avertissement), 2 tests, build ; recette navigateur en 1672 × 941 : création d’un formateur fictif avec CV et invitation, réouverture et téléchargement. Données de recette retirées. Un formateur sans organisme ne peut plus être planifié : en attribuer un. Rien n’est commité.
- Écart au cahier des charges (Formateurs : « formations assurées »), à la demande de l’utilisateur. La page de création d’utilisateur, dont les sélecteurs d’organisme et de photo sont désormais partagés, n’a pas été revue au navigateur.

### Retours sur la page formateur — 25 novembre 2026

- Demandes de l’utilisateur : retirer la signature, fermer la liste des organismes au clic ailleurs, disposer aussi de la modification.
- Documents limités au CV et à la convention (écran et API). La liste des organismes se ferme au clic ou au focus hors du champ (formateurs et utilisateurs).
- La modification existait déjà sur la même page (`/settings/trainers/:id/edit`, bouton Modifier) ; enregistrement revérifié au navigateur (spécialité et second organisme).
- Vérifications : PHPUnit 23 tests, 267 assertions ; lint (un avertissement), 2 tests, build ; recette navigateur. Données de recette retirées. Rien n’est commité.

### Page Créneaux d’après la maquette — 25 novembre 2026

- Demande de l’utilisateur : intégrer la maquette des créneaux (barre de navigation non modifiée).
- Recherche, filtre de statut, vues Liste et Calendaire (frise sur une journée), tri, sélection, pagination, panneau latéral d’ajout et de modification avec durée calculée.
- Statut actif ajouté (`Version20261125070000`, appliquée en local). Un créneau inactif n’est plus proposé ni accepté à la planification. Un créneau utilisé par une classe ne peut pas être supprimé (API 409) : la fenêtre propose de le désactiver. `GET /api/time-slot-usage`.
- Écriture réservée au super admin, comme avant. Fenêtre de confirmation centrée (la maquette la place en bas).
- À surveiller : modifier les horaires d’un créneau déjà utilisé change l’affichage des classes existantes, leurs réservations Zoom gardant les anciennes heures. Comportement antérieur, non traité.
- Vérifications : PHPUnit 24 tests, 272 assertions ; lint (un avertissement), 2 tests, build ; recette navigateur en 1586 × 992. Créneau fictif supprimé. Rien n’est commité.

### Couleurs d’organisme, créneaux et pictogrammes — 25 novembre 2026

- Demandes de l’utilisateur : couleur paramétrée de l’organisme dans la sélection multiple ; retirer le fil d’Ariane des créneaux ; pictogrammes nets et d’un même thème partout.
- Sélection multiple (formateurs et utilisateurs) : pastille et puce à la couleur de l’organisme ; sans couleur choisie, violet pour Phocea et bleu sinon.
- Pictogrammes : les PNG sont remplacés par des icônes vectorielles Lucide, via `components/Picto.tsx` (titres, indicateurs, filtres) et directement dans la barre latérale. Concerne Formations, Formateurs, Utilisateurs, Planning, Tableau de bord, création d’organisme et navigation. Logos, photos, vagues décoratives et page de connexion (rendu validé) conservés. Les anciens PNG restent dans `front/public`, inutilisés.
- Non traité : les badges d’organisme des tableaux et du planning gardent une couleur déduite du code ; le fil d’Ariane des pages formateur est conservé (maquette).
- Vérifications : lint (un avertissement), 2 tests, build ; recette navigateur en 1440 × 900 (formateurs, formations, utilisateurs, planning, tableau de bord, créneaux, sélection multiple). Création d’organisme non revue à l’écran. Rien n’est commité.

### Actions des créneaux — 25 novembre 2026

- Demande de l’utilisateur : mêmes actions que les autres tableaux. Les icônes seules de la maquette sont remplacées par Modifier, Activer ou Désactiver et Supprimer, avec le style partagé.
- Vérifications : lint (un avertissement), 2 tests, build ; comparaison au navigateur avec Formations en 1440 × 900. Rien n’est commité.

### Commit — 25 novembre 2026 (formateurs, créneaux, pictogrammes)

- À la demande de l’utilisateur, le travail en attente est commité sur la branche `feat/formateurs-creneaux-pictos`. Ni fusionné dans `main`, ni poussé, ni déployé. Les mentions « non commité » des sections précédentes sont closes par ce commit.
- Au déploiement : appliquer `Version20261125060000` et `Version20261125070000`.
- Fusionné dans `main` et poussé sur `origin` à la demande de l’utilisateur. Déploiement non vérifié.

### Composants de liste partagés — 25 novembre 2026

- Demande de l’utilisateur : des composants réutilisables, sur le modèle d’Utilisateurs. Vaut autorisation de modifier la liste Organismes (parcours protégé).
- **Règle pour la suite : toute nouvelle liste est assemblée avec `front/src/components/list/List.tsx`** (`ListPage`, `PageHeader`, `Filters`, `SearchField`, `SelectField`, `ViewToggle`, `DataTable`, `RowActions` et actions, `ActiveBadge`, `Badge`, `OrgBadges`, `EmptyState`, `Pagination`). Styles dans `list.css` ; aucun écran ne redessine un en-tête, un tableau, un bouton ou un badge.
- Appliqué à Organismes (vue tableau, en-tête, filtres, pagination ; les cartes restent), Utilisateurs, Rôles et permissions, Formateurs, Formations et Créneaux. `users.css` supprimé.
- Conséquences : nombre dans chaque titre ; « Créer un rôle » passe dans l’en-tête ; sélecteur d’organisme en haut de Formations retiré (doublon du filtre) ; recherche de nouveau visible sur Formateurs ; badges d’organisme à la couleur paramétrée dans ces listes.
- Restent à traiter : autres listes (Classes, Participants, Journal d’audit, Modèles de messages, Comptes Zoom, `CrudPage`), anciennes règles CSS devenues inutiles, cartes de chiffres d’Organismes et Rôles propres à chaque écran.
- Vérifications : lint (un avertissement), 2 tests, build ; recette navigateur en 1440 × 900 des six écrans, pagination, filtre, état vide, réinitialisation, panneaux de modification. Petits écrans non vérifiés. Rien n’est commité.

### Titres de liste — 25 novembre 2026

- Demande de l’utilisateur, avec image de référence, avant tout commit : le titre de page ne porte que le nom de la rubrique ; « Liste des … (n) » coiffe la carte qui englobe le tableau ; boutons de vue libellés comme sur Créneaux.
- `ListHeading` et les propriétés `title` / `tools` de `DataTable` portent ce titre. Le nombre est le total avant filtres. Organismes : boutons « Cartes » et « Liste » dans cet en-tête, y compris en vue cartes.
- Vérifications : lint (un avertissement), 2 tests, build ; recette navigateur en 1440 × 900 d’Utilisateurs, Organismes (cartes), Rôles et Créneaux (liste et calendaire). Formateurs et Formations non revus à l’écran. En attente de commit.
- Commité sur la branche `feat/composants-listes` à la demande de l’utilisateur. Ni fusionné, ni poussé. La mention « En attente de commit » est close.

### Fil d’Ariane formateur et accès — 25 novembre 2026

- Demande de l’utilisateur : retirer « Paramétrage > Formateurs > Créer un formateur ». Retiré en création et en modification ; le retour se fait par Annuler ou la barre latérale.
- Question : impossible de se connecter en tant qu’un formateur. Cause relevée dans le journal : fiche créée inactive (aucune invitation envoyée), activée ensuite sans créer l’accès ; aucun compte n’existe. Remède : « Créer l’accès à Sofia » sur sa fiche. Rien modifié dans ses données.
- Amélioration possible, non développée : proposer la création de l’accès à l’activation, ou expliquer le bouton grisé.
- Vérifications : lint (un avertissement), 2 tests, build. Non revu à l’écran. Non commité.

### Accès formateur et statut — 25 novembre 2026

- Demande de l’utilisateur : la carte « Accès à Sofia » doit suivre l’interrupteur de statut sans attendre.
- Elle réagit immédiatement et demande d’enregistrer tant que le statut affiché diffère du statut enregistré ; les boutons d’accès sont masqués dans cet intervalle.
- Vérifications : lint (un avertissement), 2 tests, build ; bascule contrôlée au navigateur sans enregistrer. Non commité.
- Commité, fusionné dans `main` et poussé sur `origin` à la demande de l’utilisateur (composants de liste compris). Les mentions « non commité » sont closes. Déploiement non vérifié.

### Bouton Supprimer des utilisateurs — 25 novembre 2026

- Question de l’utilisateur : pourquoi est-il grisé. Choix d’origine : les comptes sont conservés pour le journal d’audit et désactivés ; l’API ne propose pas de suppression.
- Décision en attente : garder, retirer le bouton, ou développer une suppression logique. Aucun code modifié.

### Suppression logique partout — 25 novembre 2026

Demandes de l’utilisateur :
- Comptes utilisateurs : suppression logique (`DELETE /api/users/{id}`, super admin, jamais son propre compte), bouton activé avec confirmation. Le compte quitte la liste, ne peut plus se connecter, libère sa fiche formateur ; son e-mail reste réservé.
- **Règle du projet (ajoutée à `CLAUDE.md`) : toute entité étend `SoftDeletable` et porte `deleted_at`.** Exception retenue par l’IA, à confirmer : `AuditLog`, en ajout seul. `SoftDeleteConventionTest` fait échouer les tests pour une entité qui l’oublie.

Livré : `Version20261125080000` (utilisateurs) et `Version20261125090000` (autres entités, `virtual_class_config`, `organization_draft`), appliquées en local. La date est renseignée à la suppression d’un compte, l’annulation d’une inscription (effacée si elle est réactivée), l’archivage d’une configuration (effacée au désarchivage) et l’abandon d’un brouillon. Organismes, formations, formateurs, créneaux et documents l’avaient déjà. `ConfirmDialog` partagé ajouté aux composants de liste.

Limites : les inscriptions annulées et configurations archivées avant ce changement n’ont pas de date (elle figure au journal d’audit) ; les liens entre entités (rattachements aux organismes) sont toujours retirés physiquement ; les autres entités n’ont pas encore d’action de suppression ; l’annulation d’une inscription apparaît « DELETE » au journal.

Vérifications : PHPUnit 27 tests ; lint (un avertissement), 2 tests, build ; suppression d’un compte fictif au navigateur. Le serveur de développement du front a été redémarré (ancienne feuille de style servie). Non commité.
- Validé par l’utilisateur : le journal d’audit reste sans `deleted_at` (exception confirmée).

### Tableau Organismes enrichi — 25 novembre 2026

- Demande de l’utilisateur : améliorer la liste des organismes ; choix retenu : enrichir le tableau (cartes inchangées, vue par défaut inchangée).
- Colonnes : logo cerclé à la couleur de l’organisme et nom, code en pastille de couleur, e-mail, ville, statut, classes, apprenants, actions. Même règle de logo que les cartes.
- Vérifications : lint (un avertissement), 2 tests, build ; vue Liste contrôlée en 1440 × 900 sans défilement horizontal. Non commité.

### Rôles : nombre de personnes et suppression — 25 novembre 2026

- Demande de l’utilisateur : voir combien de personnes ont chaque rôle et supprimer un rôle, avec un message s’il est attribué.
- Colonne « Personnes » (comptes non supprimés, désactivés compris ; rôles système et personnalisés). `DELETE /api/custom-roles/{id}` : suppression logique, super admin, refus 409 si le rôle est attribué ; fenêtre « Suppression impossible » avec le nombre. Les rôles système restent protégés. Un rôle supprimé n’est plus attribuable et son nom reste réservé.
- Vérifications : PHPUnit 28 tests, 313 assertions ; lint (un avertissement), 2 tests, build ; recette navigateur : suppression d’un rôle fictif, refus sur un rôle attribué, tableau en 1440 × 900. Non commité.

### Filtre « Supprimé » — 25 novembre 2026

- Demande de l’utilisateur : afficher les éléments supprimés depuis les filtres.
- Choix « Supprimé » sur Organismes, Utilisateurs, Rôles, Formateurs, Formations et Créneaux (`components/list/useDeleted.ts`). Consultation seule, avec la date de suppression ; aucune action ni restauration. Organismes s’affiche alors en tableau ; Créneaux en liste.
- Choix de l’IA, à confirmer : réservé au super admin (API `?deleted=1`, 403 sinon). « Tous les statuts » n’inclut pas les supprimés.
- Vérifications : PHPUnit 29 tests, 335 assertions ; lint (un avertissement), 2 tests, build ; six écrans contrôlés au navigateur. Non commité.
- Validé par l’utilisateur : le filtre « Supprimé » est ouvert aux admins aussi (dans leur périmètre d’organismes) ; refusé aux autres rôles. Utilisateurs et Rôles restent des écrans super admin.

- 2026-11-26 : demande d’une maquette (via ChatGPT) réunissant Comptes Zoom et Configurations des classes virtuelles sur un même écran. Prompt fourni dans la conversation ; aucun code modifié. Point à valider sur la maquette : les comptes Zoom restent réservés au super administrateur, les configurations suivent leurs permissions actuelles.

- 2026-11-26 : demande d’une maquette (via ChatGPT) pour la création d’une formation, inspirée du projet voisin `platform`. Prompt fourni dans la conversation ; aucun code modifié. Repris dans le prompt mais absents de Sofia, à valider : description, objectifs, codes ANDPC (année + code). Écartés : e-learning, EPP, questionnaires, prix, chapitres, FIFPL/CPF/personnel, quiz Zoom.

- Validé par l’utilisateur (2026-11-26) : la fiche formation gardera la description, les objectifs pédagogiques et les codes ANDPC (année + code, organisme repris de la formation). Non développé : attente de la maquette.

- 2026-11-26 : prompt de maquette fourni pour l’écran liste « Formations » (aucun code modifié).

- Demandé par l’utilisateur (2026-11-26) : sur une formation, pouvoir choisir le type de financement. Proposé dans les prompts de maquette, à valider : choix multiple parmi ANDPC, FIFPL, CPF, Personnel (repris de `platform`) ; carte des codes ANDPC affichée seulement si ANDPC est coché ; colonne et filtre « Financement » dans la liste. Aucun code modifié.

- Validé par l’utilisateur (2026-11-26) : pas de CPF. Types de financement d’une formation : ANDPC, FIFPL, Personnel.

- 2026-11-26 : prompt de maquette des formations (liste + création) refait en un seul texte avec les choix validés ; aucun code modifié.

### Relecture de « Paramètres Zoom » (écran refait avec ChatGPT) — 26 novembre 2026

- Avis demandé par l’utilisateur ; aucun code modifié par cette relecture. `/settings/zoom` : vue d’ensemble + 4 étapes ; anciennes adresses redirigées. Non commité.
- Vérifications : lint (0 erreur, 2 avertissements dont un nouveau dans `VirtualClassConfigs.tsx`), 2 tests, build ; cinq vues et le formulaire de configuration contrôlés en 1440 × 900, données vides, sans enregistrement. PHPUnit non relancé (pas de changement backend pour cet écran).
- Points à corriger (non traités) : couleur des organismes selon la position (`.zw-tag:nth-child(even)`) au lieu de leur couleur ; composants de liste partagés non réutilisés ; étape 4 redondante et liste déroulante mal placée dans le tableau ; premier paramétrage peu guidé ; changer d’étape ferme un formulaire sans avertir ; erreur d’enregistrement d’un hôte affichée dans la liste et non dans le formulaire.

### Correction de « Paramètres Zoom » — 26 novembre 2026

- Validé par l’utilisateur : « Oui, corrige tout » (les six points de la relecture précédente).
- Fait : 3 étapes (le rattachement des organismes se fait dans la configuration ; les organismes sans configuration sont signalés ; `?step=organizations` ouvre l’étape 3) ; sans hôte ni configuration, le super admin arrive sur la connexion, blocs empilés et explication du bouton grisé ; hôtes et configurations sur les composants de liste partagés ; badges d’organismes à leur couleur (l’API des configurations renvoie `code` et `color`) ; confirmation avant d’abandonner une saisie via les étapes, la vue d’ensemble ou une autre fiche ; erreurs d’enregistrement dans le formulaire. `ZoomFilters.tsx` remplacé par `ZoomPage.tsx` et `zoomShared.ts`.
- Vérifications : lint (l’avertissement connu `FormParts.tsx`), 2 tests, build, PHPUnit 29 tests, 338 assertions ; contrôle en 1440 × 900 avec réponses simulées dans le navigateur (aucune écriture Zoom en base). Non commité.
- Non traité ou non vérifié : quitter par la barre latérale ou le bouton retour du navigateur ne demande pas de confirmation ; panneau ouvert, le tableau des hôtes défile horizontalement ; vue administrateur, petits écrans et connexion Zoom réelle non contrôlés.

### Liste des formations — 27 novembre 2026

Écran intégré dans /settings/trainings avec recherche par titre, référence ou code, filtres organisme, financement et statut, tri, pagination et actions selon les permissions. Le formulaire existant permet de saisir le public et plusieurs financements. Les codes ANDPC (année et code) sont gérés par l’API et affichés dans la liste. Leur saisie dans la future fiche reste à réaliser. Le modèle conserve un organisme par formation. Les suppressions restent consultables via le filtre réservé aux administrateurs.

Migration Version20261127100000 appliquée en développement et de manière ciblée en test. La base de test habituelle présente un historique de migrations incomplet et des colonnes manquantes. Sur la base isolée app_test_catalog27 créée avec les 27 migrations, PHPUnit passe (29 tests, 338 assertions). Frontend : build, deux tests réussis et lint avec trois avertissements Fast Refresh hors catalogue. Comparaison visuelle au navigateur à effectuer.

### Image dans la liste des formations — 27 novembre 2026

Dans la colonne Formation, la vignette apparaît à gauche du titre et de la référence. Le pictogramme de thématique occupe cet emplacement lorsqu’aucune image n’a été téléversée. La création et la modification acceptent JPEG, PNG et WebP jusqu’à 10 Mo. Le navigateur conserve les proportions et transmet une vignette JPEG de 320 pixels maximum avec le formulaire. L’audit trace le changement sans dupliquer le contenu de l’image. Migration Version20261127110000 appliquée en développement et sur app_test_catalog27. Build et deux tests frontend réussis, trois avertissements lint existants. PHPUnit isolé réussi (29 tests, 338 assertions). Téléversement interactif en navigateur à vérifier.

### Modalité des formations — 27 novembre 2026

La liste utilise une vignette carrée de 48 px recadrée à gauche du titre. La colonne triable « Modalité » affiche le choix de la fiche en pastille violette. Le champ facultatif accepte À distance, Classe virtuelle, Mixte ou Présentiel. Les fiches existantes restent sans modalité jusqu’à leur mise à jour. Migration Version20261127120000 appliquée en développement et sur la base isolée app_test_catalog27. Build, 2 tests frontend et 29 tests PHPUnit réussis. Trois avertissements lint existants. Rendu navigateur non contrôlé.

### Statuts et synthèse du catalogue — 27 novembre 2026

Quatre cartes avec pictogrammes SVG précèdent les filtres. Elles comptent les formations accessibles hors suppressions, au total et par statut de publication. Brouillon, Publiée et Archivée sont disponibles dans la fiche et le filtre. Le statut de publication est indépendant de l’activation métier. Les anciennes fiches et les nouvelles démarrent en brouillon. Migration Version20261127130000 appliquée en développement et dans app_test_catalog27. Build, deux tests frontend et 29 tests PHPUnit réussis. Trois avertissements lint préexistants. Rendu navigateur non contrôlé.

### Filtrage par les cartes — 27 novembre 2026

Les trois cartes de publication sélectionnent le statut correspondant en conservant la recherche, l’organisme et le financement. Le total réinitialise tous les filtres. Les boutons sont accessibles au clavier et leur état sélectionné suit le filtre Statut. Build et deux tests frontend réussis, trois avertissements lint préexistants. Interaction non contrôlée en navigateur.

### Référence des formations — 27 novembre 2026

L’API calcule la référence à la lecture avec l’initiale majuscule du public, un tiret et le slug du titre. Le formulaire indique cette règle et la liste utilise le résultat pour l’affichage et la recherche. Une ancienne référence sert de repli si le calcul est impossible. Aucune migration requise. Exemple vérifié dans PHP : Médecins et Éducation thérapeutique du patient donnent M-education-therapeutique-du-patient. PHPUnit isolé (29 tests), tests frontend (2) et build réussis. Trois avertissements lint préexistants.

### Protection des formations utilisées — 27 novembre 2026

La suppression logique d’une formation renvoie 409 dès qu’une classe virtuelle lui est liée, y compris une classe supprimée ou sans inscrit. Toute inscription dépend d’une classe. La planification et la suppression verrouillent la même formation dans leur transaction. Le catalogue désactive le bouton lorsque les sessions visibles indiquent cet usage. Test fonctionnel ajouté pour la suppression autorisée et le refus lié à une session historique. PHPUnit isolé réussi (30 tests, 341 assertions), deux tests frontend et build réussis, trois avertissements lint existants. Pas de migration.

### Création des formations — 27 novembre 2026

Ajouter une formation ouvre /settings/trainings/new. Parcours en cinq étapes avec aperçu du titre, de la catégorie, de la modalité, de la description et du visuel. Un titre et un organisme permettent d’enregistrer un brouillon et de le reprendre via Modifier. L’étape Programme recueille les objectifs, l’étape Évaluations décrit la méthode en texte libre, les financements proposent ANDPC, FIFPL et Personnel avec plusieurs couples année/code pour ANDPC. La validation publie dans le catalogue. Les formations déjà publiées conservent le tiroir d’édition historique. La migration Version20261127140000 ajoute description, objectifs, méthode d’évaluation, prérequis et langue. Appliquée en développement et sur app_test_catalog27. Test UI des cinq étapes et test API de reprise/publication réussis. Totaux : 3 tests frontend, 31 PHPUnit, build réussi, trois avertissements lint existants. Comparaison visuelle en navigateur non effectuée.

### Accès à la création depuis le catalogue — 27 novembre 2026

Le bouton « Créer une formation » utilise l’en-tête partagé, avant les cartes et les filtres. Il ouvre /settings/trainings/new pour les personnes autorisées à modifier les formations. Un test d’interface vérifie sa présence dans l’en-tête et l’ouverture du formulaire. Quatre tests frontend et build réussis, trois avertissements lint préexistants.

### Lecture du cahier des charges MEDELIO — 27 novembre 2026

Synthèse métier du document de revue du 24 août 2026 conservée dans docs/synthese-metier-medelio.md, avec renvois aux pages sources. Pour la fiche formation, distinguer modalité, type de programme et méthode pédagogique. Les besoins groupe et les dispositifs propres aux filiales restent des éléments de cadrage. Aucune évolution applicative engagée par cette lecture.

- 27 novembre 2026 — À la demande de l’utilisateur, le formulaire de création et de reprise de brouillon affiche « Type de programme » pour le champ modality. Changement de libellé uniquement. Les quatre tests frontend et le build passent.
- 27 novembre 2026 — La colonne « Modalité » de la liste des formations s’intitule désormais « Type de programme », comme dans le formulaire de création. Les quatre tests frontend et le build passent.
- 27 novembre 2026 — Le formulaire de modification des formations affiche également « Type de programme ». Les quatre tests frontend et le build passent.

- 27 novembre 2026 — Dans la création et la reprise de brouillon, l’étape Programme regroupe orientation (texte facultatif), description et objectifs pédagogiques. La description se saisit et se valide à cette étape. Migration Version20261127150000 appliquée en développement et sur app_test_catalog27. Build, 4 tests frontend et 31 tests PHPUnit réussis (353 assertions).

- 27 novembre 2026 — Création et reprise de brouillon en quatre étapes : Informations, Programme, Financements, Validation. Financements propose ANDPC, FIFPL et Personnel. Le dernier écran récapitule les saisies, permet de modifier chaque rubrique et calcule la progression sur dix éléments, y compris les champs facultatifs. Les anciens contenus d’évaluation restent en base. Test de navigation, correction des financements et publication réussi. Quatre tests frontend et build réussis, trois avertissements lint préexistants. Comparaison visuelle en navigateur non effectuée.

### Fiche de modification — 27 novembre 2026

Modifier ouvre /settings/trainings/:id/edit pour tous les statuts. Conception édite la fiche et son image, Diffusion gère le statut, l’activation et les financements, Pilotage consulte les sessions autorisées et leurs inscriptions actives. Aperçu, impression pour export PDF, duplication en brouillon et archivage disponibles. La saisie est conservée entre onglets. Les scores et taux de complétion sont signalés indisponibles. La fiche ne gère pas les versions publiées ni une visibilité catalogue indépendante. Test UI de modification et de filtrage des sessions ajouté. Cinq tests frontend et build réussis, trois avertissements lint existants. Comparaison visuelle en navigateur non effectuée.

- 27 novembre 2026 — Création simplifiée : catégorie, prérequis, langue et capacité retirés. Capacité saisie sur la classe virtuelle. Public cible sélectionné dans un référentiel avec gestion intégrée. Suppression refusée tant qu’une formation y est liée, y compris dans l’historique. La migration reprend les publics existants. Sélection de plusieurs organismes avec le premier comme porteur pour la planification et le périmètre d’accès. Référence personnalisable, avec génération automatique si vide. Migration Version20261127160000 appliquée en développement et en test isolé. Build, cinq tests frontend et 32 tests PHPUnit réussis.

- 27 novembre 2026 — À la demande de l'utilisateur : création de formation harmonisée sur le bleu de l'application (fin de l'accent rose, partagé avec la fiche de modification) ; les organismes utilisent le champ multi-sélection `OrganizationPicker` (premier sélectionné = porteur) ; les publics cibles ont leur écran `/settings/target-audiences` dans le menu Administration (visible avec `EDIT_TRAININGS`, droits API inchangés), la gestion sous le champ est retirée. Lint (3 avertissements connus), 5 tests et build réussis ; contrôle navigateur 1440 × 900 avec réponses simulées, sans écriture en base. Pas de changement API. Non fait : la fiche de modification garde son sélecteur d'organisme simple ; pas d'unicité sur le nom d'un public. Non commité.
- 27 novembre 2026 — Publics cibles : champs « Libellé » et « Acronyme » (20 caractères max), obligatoires ; la liste affiche ID, Libellé, Acronyme, et la recherche porte sur les deux textes. Les publics existants ont un acronyme vide (« — ») à compléter. Migration Version20261127170000 appliquée en développement et sur app_test_catalog27 (`TEST_TOKEN=_catalog27`). PHPUnit isolé 32 tests, 5 tests frontend, build réussis, lint 3 avertissements connus. PHPStan signale 41 erreurs hors publics cibles (à traiter). Contrôle navigateur avec réponses simulées. La référence automatique d'une formation utilise toujours l'initiale du libellé, pas l'acronyme. Non commité.
- 27 novembre 2026 — Validé par l'utilisateur : la référence automatique d'une formation utilise l'acronyme du public cible (slugifié, en majuscules, ex. `MED-formation-pilote`) ; sans acronyme, repli sur l'initiale du libellé. La référence personnalisée reste prioritaire. Calculée à la lecture, donc les formations existantes changent dès que l'acronyme est saisi. PHPUnit isolé (32 tests), 5 tests frontend et build réussis. Non commité.
- 27 novembre 2026 — Journal d'audit (demande « tout tracer ») : la ressource s'affiche en français avec le nom de l'élément ; un détail par ligne montre avant/après, le contenu supprimé et les données envoyées (méthode, chemin, payload). Nouvelles colonnes `audit_log.request` et `label` (migration Version20261127180000, développement et app_test_catalog27), `GET /api/audit/{id}` super admin. `RequestAudit` joint la requête à chaque ligne, et crée une ligne pour les écritures sans trace Doctrine (SQL direct) et les actions refusées d'utilisateurs connectés ; déconnexion tracée. Liens multiples et archivage (`ARCHIVE`) tracés. Secrets masqués, fichiers résumés par leur taille, textes tronqués à 5000 caractères. Non couvert : consultations (GET), valeurs « avant » des écritures SQL directes, commandes console en SQL direct, webhooks Zoom, requêtes anonymes refusées. Les payloads contiennent des données personnelles : aucune purge ni durée de conservation définie. PHPUnit isolé 33 tests, 5 tests frontend, build réussis, lint 3 avertissements connus. Contrôle navigateur avec réponses simulées. Non commité.
- 27 novembre 2026 — Validé par l'utilisateur (choix « Toute l'entité ») : `Training` renommé `Formation` partout : classes, propriétés, API `/api/formations`, écrans `/settings/formations`, permissions `FORMATIONS` / `EDIT_FORMATIONS`, tables et colonnes (`formation`, `formation_id`, `trainer_formation`, `formation_additional_organization`). Les anciennes adresses `/settings/trainings/*` redirigent. `Trainer` (formateur) inchangé. Les sections précédentes de ce fichier emploient les anciens noms. Les lignes d'audit antérieures gardent `Training` (journal en ajout seul), affichées « Formation ». Migration Version20261127190000 (renommages, sans perte) appliquée en développement et sur app_test_catalog27. Sauvegardes avant renommage (code et base dev) dans le dossier temporaire de la session IA, non durable. PHPUnit isolé 33 tests, 5 tests frontend, build réussis, lint 3 avertissements connus. Non commité.
- 27 novembre 2026 — Travail commité (`f296ebc`), fusionné dans `main` et poussé sur `origin` à la demande de l'utilisateur. Les mentions « non commité » précédentes sont closes. Déploiement non effectué ; tout environnement existant devra passer les migrations jusqu'à Version20261127190000. PHPStan garde des erreurs à corriger.
- 27 novembre 2026 — Erreurs PHPStan corrigées (niveau 6, zéro erreur) : annotations de types uniquement dans `api/src`, `rememberPossiblyImpureFunctionValues: false` pour les tests d'idempotence, retour de `call()` des tests élargi à `array<mixed>`. Aucun changement de comportement. PHPUnit isolé 33 tests. Commité sur `fix/phpstan`, fusionné dans `main` et poussé à la demande de l'utilisateur. Déploiement non effectué.
- 27 novembre 2026 — Barre haute (partie droite) harmonisée sur le modèle d'Edeliora : espacement fixe de 10 px, hauteur 64 px, icônes dans des zones de 40 px, compte (avatar, nom, rôle, chevron) en un seul bouton avec survol, nom masqué sur mobile. Styles regroupés dans `components/navigation.css`. Aide et notifications restent sans action. Contrôle navigateur 1440 × 900 et 375 × 812 avec réponses simulées ; 5 tests frontend et build réussis. Branche `feat/barre-haute`.
- 27 novembre 2026 — Menu de gauche (précision de l'utilisateur) harmonisé sur le modèle d'Edeliora : largeur fixe 240 px (208 px entre 761 et 1150 px), lignes de 36 px espacées de 2 px, 12 px entre groupes, icônes 18 px, titres de groupe en petites capitales avec chevron, sans icône ni filets. Styles de la barre latérale regroupés dans `components/navigation.css` (retirés de `planning.css`). Contrôle navigateur 1440 × 900 et 375 × 812 avec réponses simulées ; 5 tests frontend et build réussis. Constat : le menu actuel n'affiche pas les entrées phase 2 « Bientôt » prévues au CLAUDE.md. Branche `feat/barre-haute`.
- 27 novembre 2026 — Menu de gauche rétractable comme dans Edeliora : bouton rond sur le bord, menu replié à 72 px avec icônes seules, marque du logo, séparateurs à la place des titres de groupe, libellés conservés pour les lecteurs d'écran et en infobulle. Choix mémorisé par compte dans `localStorage` (`sofia.sidebar.<email>`). Sans effet sur mobile. Test `Layout.test.tsx` ajouté ; 6 tests frontend et build réussis, lint 3 avertissements connus. Contrôle navigateur 1440 × 900. Branche `feat/barre-haute`.
- 27 novembre 2026 — Retouches des deux barres commitées sur `feat/barre-haute`, fusionnées dans `main` et poussées à la demande de l'utilisateur. Les mentions « non commité » correspondantes sont closes. Déploiement non effectué.
- 27 novembre 2026 — Création de formation : l'aperçu à droite affiche public cible (libellé et acronyme), référence (`ACRONYME-slug-du-titre`, ou la référence saisie qui reste prioritaire), durée et prix. Nouveau champ `Formation.price` (euros, `NUMERIC(10,2)`, facultatif ; HT/TTC non précisé), saisi à la création et dans la fiche de modification, repris au résumé et à l'impression. Aperçu de la référence calculé côté navigateur (`formationFormat.ts`), l'API reste la source. Migration Version20261127200000 appliquée en développement et sur app_test_catalog27. PHPUnit 33, PHPStan sans erreur, 6 tests frontend, build réussis. Le prix n'est pas affiché dans la liste des formations. Branche `feat/formation-prix`, non commité.

- 27 novembre 2026 — Ajout d’aides sous les champs de création et de reprise. Le résumé de validation présente référence, organismes, durée et tarif dans une fiche synthétique, avec le titre, le type de programme et le public. Six tests frontend et build réussis.
- 27 novembre 2026 — Écriture de la création (et de la fiche) de formation alignée sur la création d'organisme : encre #101d41, base 15 px, libellés 14 px/600, saisies en 400 (elles héritaient du gras), titres de carte comme chez les organismes, aides 12 px, astérisques rouges. Des modifications ont eu lieu en parallèle sur les mêmes fichiers (aides sous les champs) ; leurs styles, écrits dans `training-wizard.css` que rien n'importe, sont recopiés dans `formation-wizard.css`. Ce fichier orphelin reste à supprimer par son auteur. 6 tests frontend et build réussis, contrôle navigateur 1440 × 900 simulé. Non commité.
- 27 novembre 2026 — Aperçu de formation redisposé (l'utilisateur n'aimait pas la liste empilée) : type de programme, titre, extrait de description sur quatre lignes, puis tuiles avec icônes (public cible et référence en pleine largeur, durée et prix côte à côte, « À renseigner » si vide). 6 tests frontend et build réussis, contrôle navigateur 1440 × 900 simulé. Non commité.
- 27 novembre 2026 — Précision de l'utilisateur : la référence est l'agrégat de l'acronyme du public cible et de celui de la formation. « Slug ou référence » (`customReference`) devient `Formation.acronym` ; `Formation.reference` est désormais stockée (300 caractères), générée par l'API à chaque enregistrement (`MG-ETP`, ou `MG-slug-du-titre` sans acronyme), non saisissable ; sans public, l'ancienne valeur est conservée. Elle ne change plus à l'affichage : modifier l'acronyme d'un public ne la met à jour qu'au prochain enregistrement de la formation. Remplace les décisions précédentes sur la référence personnalisée. Champ lecture seule dans la création et la fiche. Migration Version20261127210000 appliquée (dev et app_test_catalog27), sauvegarde dev dans le dossier temporaire de session. PHPUnit 33, PHPStan sans erreur, 6 tests frontend, build réussis. Non commité.
- 27 novembre 2026 — Un brouillon se reprend dans les étapes de création : `/settings/formations/:id/edit` redirige vers `/resume` quand le statut est « draft » (catalogue, duplication, lien enregistré ; repasser une fiche en brouillon y renvoie aussi). Le bouton de liste affiche « Reprendre ». Remplace « Modifier ouvre la fiche pour tous les statuts ». 7 tests frontend et build réussis, contrôle navigateur simulé. Non commité.
- 27 novembre 2026 — Étape 3 Financements : une carte par financement ; ANDPC demande le numéro d'action DPC et l'année pour chaque organisme sélectionné (bloc à sa couleur, n° ANDPC de l'organisme rappelé, plusieurs années possibles). `andpcCodes` porte désormais `organization` (facultatif pour l'existant, rattaché à l'organisme porteur à l'écran ; l'API refuse un organisme étranger à la formation). Publication bloquée dans le parcours tant qu'un organisme n'a pas de numéro (brouillon autorisé ; pas de contrôle équivalent côté API). La fiche de modification permet de choisir l'organisme de chaque code. Point ouvert : informations demandées pour FIFPL et Personnel non définies. PHPUnit 33, PHPStan sans erreur, 7 tests frontend, build réussis. Non commité.
- 27 novembre 2026 — Validé « les essentiels » (modèle relevé dans le projet platform, lecture seule) : par organisme et par année, ANDPC = numéro d'action DPC, prix HT, prise en charge ; FIFPL = code, durée en heures, prix HT ; Personnel = prix HT, prix TTC. Nouveaux champs `Formation.fifplCodes` et `personalPrices` (JSON, migration Version20261127220000), `andpcCodes` étendu ; montants et heures en chaînes décimales. Publication (parcours) exigeant un code ANDPC et FIFPL par organisme ; Personnel facultatif. `Formation.price` conservé comme prix catalogue. Exclus (phase 2) : Stripe, durées et tarifs par unité. La fiche de modification n'édite pas encore ces nouveaux champs (conservés et dupliqués). PHPUnit 33, PHPStan sans erreur, 7 tests frontend, build réussis, contrôle navigateur simulé. Non commité.
- 27 novembre 2026 — La fiche de modification (onglet Diffusion) saisit les mêmes lignes de financement que la création (composant `FundingRows`), pour l'organisme porteur et les associés ; remplace l'ancien éditeur de codes ANDPC. La fiche n'exige pas de code par organisme à l'enregistrement. 8 tests frontend et build réussis, contrôle navigateur simulé. Non commité.
- 27 novembre 2026 — Demande utilisateur : le prix de la première étape préremplit chaque « Prix HT » des financements (ANDPC, FIFPL, Personnel) dans le parcours de création ; il est enregistré avec une ligne par organisme et par financement sélectionné. Une ligne modifiée garde sa valeur, une ligne au prix catalogue continue de le suivre à la reprise. Un champ vidé reprend le prix après reprise du brouillon. TTC et prise en charge non préremplis ; la fiche de modification ne préremplit pas. 8 tests frontend et build réussis. Non commité.
- 27 novembre 2026 — Financements en accordéon (création et fiche) : un panneau ouvert à la fois, le dernier financement coché s'ouvre, l'en-tête indique « Complet » ou le nombre d'organismes renseignés ; publier avec un code manquant ouvre le premier panneau incomplet. 8 tests frontend et build réussis, contrôle navigateur simulé. Non commité.
- 27 novembre 2026 — Étape Validation redessinée (`FormationReview.tsx`) : blocs Informations (visuel, titre, organismes, tuiles), Programme, Financements (un tableau par financement), état et « Modifier » par bloc, bandeau de publication, liste des points à vérifier avec pictogrammes et barre de progression bleue. 8 tests frontend et build réussis, contrôle navigateur 1440 × 900 simulé. Non commité.
- 27 novembre 2026 — Étape Validation, remplace la disposition précédente à la demande de l'utilisateur : deux colonnes ; à gauche un anneau de progression, une carte par rubrique (barre segmentée, points en pastilles, « Modifier ») ; à droite « Résumé de la formation » en fiche visuelle (bandeau, organismes, tuiles, textes, lignes de financement en cartes). 8 tests frontend et build réussis, contrôle navigateur 1440 × 900 simulé. Non commité.
- 27 novembre 2026 — Option « Publier la formation » (activée par défaut) à l'étape Validation : désactivée, le bouton devient « Créer sans publier » et la formation est enregistrée avec le nouveau statut `unpublished` (« Non publiée ») et inactive, donc non planifiable ; elle s'ouvre dans la fiche, où « Publier » la publie et l'active. Le brouillon reste distinct (reprise dans les étapes). Carte et filtre « Non publiées » au catalogue. Le parcours exige toujours public, durée, description et codes pour avancer. PHPUnit 33, PHPStan sans erreur, 8 tests frontend, build réussis, contrôle navigateur simulé. Non commité.
- 27 novembre 2026 — Tout le travail depuis le prix (jusqu'à l'option de publication) commité sur `feat/formation-prix`, fusionné dans `main` et poussé à la demande de l'utilisateur ; les mentions « non commité » correspondantes sont closes. `training-wizard.css` (orphelin, créé hors de cette session) non commité. Déploiement non effectué ; migrations jusqu'à Version20261127220000 à exécuter.
- 27 novembre 2026 — `training-wizard.css` supprimé à la demande de l'utilisateur : aucun import ; ses règles sont dans `formation-wizard.css` ou visaient l'ancien résumé (`tw-summary`), retiré.
