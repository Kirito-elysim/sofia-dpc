# SOFIA / PHOCEA — Documentation technique de la refonte

2026-11-18 · mohamed mahdjoub

Document de référence pour le développement de la phase 1 : API Symfony, front React, intégration Zoom multi-comptes, notifications SMS et mail, déploiement Docker. Il complète le cahier des charges fonctionnel.

## Stack et organisation du code

Un monorepo, deux applications (API et front), un worker asynchrone et quatre services Docker.

| Couche | Choix | Version cible |
| --- | --- | --- |
| Langage backend | PHP | 8.3 |
| Framework | Symfony + API Platform | 7.x LTS / 4.x |
| ORM | Doctrine ORM + Migrations | 3.x |
| Serveur applicatif | FrankenPHP (Caddy + PHP + hub Mercure intégré) | dernière stable |
| Asynchrone | Symfony Messenger (transport Redis), Symfony Scheduler | — |
| Base de données | PostgreSQL (extension btree_gist) | 16 |
| Cache, files, verrous | Redis | 7 |
| Front | React + TypeScript, Vite, TanStack Query, composant calendrier | React 18+ |
| Tests | PHPUnit, tests d'API API Platform, Vitest côté front | — |

```
/api            Symfony (src/Domain, src/Infrastructure, src/Api)
  src/Domain          Entités, règles métier (allocation, calcul de présence)
  src/Infrastructure  Clients Zoom, OVH SMS, Zoho ; Messenger handlers
  src/Api             Ressources API Platform, voters, DTO
/front          React (pages, features, api client généré depuis l'OpenAPI)
/docker         Dockerfiles, Caddyfile, compose.yaml, compose.prod.yaml
```

- Le client TypeScript est généré depuis la spécification OpenAPI exposée par API Platform : un seul contrat entre API et front.
- Toute communication externe (Zoom, OVH, Zoho, SMTP) passe par un worker Messenger, jamais dans la requête HTTP de l'utilisateur.

## Modèle de données

Une classe virtuelle (`Session`) porte un ou plusieurs créneaux (`SessionCreneau`) ; chaque créneau est rattaché à un compte Zoom et produit ses propres logs de présence, ce qui répond à l'exigence ANDPC de tracer chaque demi-journée.

### Référentiels

| Entité | Champs clés | Remarques |
| --- | --- | --- |
| `Organisme` | nom, raison_sociale, siret, numero_andpc, logo, sms_sender (11 car. max), email_from, actif | SOFIA, STUDIO PHOCEA, extensible |
| `Formation` | organisme_id, titre, reference, duree_totale_min, capacite_defaut | Capacité reprise par défaut sur la session |
| `Creneau` | libelle, heure_debut, heure_fin, duree_min | Matin 09:00–13:00, Après-midi 14:00–17:00 |
| `Formateur` | nom, prenom, email, telephone, formations (N-N) | Pas de compte Zoom |
| `CompteZoom` | libelle, account_id, client_id, client_secret (chiffré), host_user_id, webhook_secret (chiffré), actif | Une app Server-to-Server OAuth par compte |
| `Utilisateur` | email, nom, roles, totp_secret (chiffré), actif | Comptes nominatifs |
| `MessageTemplate` | organisme_id, declencheur, canal, sujet, corps, actif | Variables : `{prenom}`, `{nom}`, `{lien}`, `{heure}`, `{formation}` |

### Opérationnel

| Entité | Champs clés | Remarques |
| --- | --- | --- |
| `Session` | organisme_id, formation_id, action_dpc, numero_session, date, reference, capacite_max, statut | La « classe virtuelle » vue par l'utilisateur |
| `SessionCreneau` | session_id, creneau_id, formateur_id, compte_zoom_id, debut, fin, zoom_meeting_id, statut_zoom | Unicité du compte sur la plage horaire (contrainte ci-dessous) |
| `ZoomInstance` | session_creneau_id, zoom_uuid, started_at, ended_at | Une ligne par lancement réel de réunion |
| `Ps` | nom, prenom, email, telephone, rpps, adresse, zoho_contact_id | Professionnel de santé |
| `Inscription` | session_id, ps_id, statut_apprenant, statut_attestation, zoom_registrant_id, join_url, zoho_deal_id | Unique (session_id, ps_id) |
| `PresenceEvent` | session_creneau_id, inscription_id (nullable), role (ps, formateur, inconnu), zoom_participant_uuid, type (join, leave), at, payload (jsonb) | Append-only, source de vérité |
| `PresenceSynthese` | session_creneau_id, inscription_id, duree_cumulee_s, nb_deconnexions, taux, premier_join, dernier_leave, connecte | Recalculée à chaque événement |
| `MessageEnvoye` | inscription_id, template_id, canal, declencheur, destinataire, contenu_rendu, statut, provider_id, envoye_par (nullable = auto), planifie_at, envoye_at | Historique de la fiche PS |
| `Alerte` | session_creneau_id, inscription_id, type, ouverte_at, traitee_par, traitee_at | Alerte 10 min |
| `AuditLog` | utilisateur_id, action, entite, entite_id, diff (jsonb), ip, at | Append-only |

### Contraintes importantes

- **Non-chevauchement des comptes Zoom** garanti par la base, pas seulement par le code :

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE session_creneau ADD CONSTRAINT compte_zoom_sans_chevauchement
  EXCLUDE USING gist (
    compte_zoom_id WITH =,
    tstzrange(debut - interval '15 minutes', fin + interval '15 minutes') WITH &&
  ) WHERE (statut_zoom <> 'supprime');
```

- La marge de 15 min est un paramètre à valider ; elle vit aussi dans la configuration pour l'algorithme d'allocation.
- Les capacités se comptent sur les `Inscription` d'une `Session` : un PS inscrit à la journée compte une fois, quel que soit le nombre de créneaux.
- Les secrets (client_secret, webhook_secret, totp) sont chiffrés en base (libsodium), la clé dans les secrets Symfony.

## Intégration Zoom

Chaque compte Zoom a sa propre app Server-to-Server OAuth ; l'API crée et supprime les réunions, inscrit les PS et formateurs, et Zoom renvoie la présence par webhooks.

### Authentification

- Jeton obtenu par `POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id={account_id}` (Basic `client_id:client_secret`), valable 1 h.
- Jeton mis en cache dans Redis par compte, renouvelé à 55 min ; un 401 force le renouvellement et un seul rejeu.
- Scopes minimaux : réunions (lecture/écriture), inscrits, rapports, utilisateurs (lecture).

### Stratégie « une classe, deux créneaux »

L'ANDPC exige des logs par demi-journée. Deux options techniques, à trancher en recette :

| Option | Principe côté Zoom | Liens PS | Logs par demi-journée | Statut |
| --- | --- | --- | --- | --- |
| A | Une réunion planifiée (type 2) sur la journée, terminée par API à la fin du matin puis relancée l'après-midi : deux instances (deux UUID) | Un lien par PS pour la journée | Un rapport par instance | À valider en recette |
| B | Une réunion par créneau (fonctionnement actuel), regroupées sous une seule `Session` dans l'outil | Un lien par PS et par créneau | Un rapport par réunion | Solution de repli sûre |

Dans les deux cas l'outil ne montre qu'une classe virtuelle, compte les PS une seule fois et rattache chaque instance Zoom au `SessionCreneau` dont la plage horaire contient son `started_at`.

### Allocation d'un compte

1. Pour chaque créneau, lister les `CompteZoom` actifs sans `SessionCreneau` sur `[debut - marge, fin + marge]`.
2. Prendre le premier (ordre stable : celui qui a le moins de réunions ce jour-là), insérer le `SessionCreneau` dans la même transaction.
3. Si la contrainte d'exclusion PostgreSQL lève une violation (création concurrente), passer au compte suivant.
4. Aucun compte disponible : rollback, erreur 409 `NO_ZOOM_ACCOUNT_AVAILABLE` affichée à l'écran, mail à l'administrateur.

### Cycle de vie d'une réunion

| Action dans l'outil | Appels Zoom (via worker) |
| --- | --- |
| Création | `POST /v2/users/{host_user_id}/meetings` (type 2, `timezone: Europe/Paris`, inscription obligatoire avec approbation automatique, notifications Zoom aux inscrits désactivées) |
| Inscription des PS | `POST /v2/meetings/{id}/batch_registrants` (lots de 30) ou `POST /v2/meetings/{id}/registrants` ; on stocke `registrant_id` et `join_url` |
| Formateur | Inscrit comme registrant, marqué `role = formateur` dans l'outil |
| Déplacement | `DELETE /v2/meetings/{id}` puis recréation complète, nouveaux liens, renvoi aux PS |
| Suppression | `DELETE /v2/meetings/{id}` ; `SessionCreneau.statut_zoom = supprime` |
| Fin de demi-journée (option A) | `PUT /v2/meetings/{id}/status` avec `action: end` à l'heure de fin + marge |

Chaque appel est idempotent côté outil (état stocké avant et après) et rejoué par Messenger en cas d'échec (3 essais, backoff exponentiel), puis signalé en erreur sur la session.

### Webhooks

- Un endpoint par compte : `POST /webhooks/zoom/{compteZoomId}`.
- Validation d'URL : répondre à `endpoint.url_validation` avec `plainToken` et `encryptedToken` = HMAC-SHA256 hex du `plainToken` avec le secret du webhook.
- Signature : recalculer `v0=` + HMAC-SHA256(`v0:{x-zm-request-timestamp}:{corps brut}`) et comparer à `x-zm-signature` ; rejeter si l'horodatage dépasse 5 min.
- Événements écoutés : `meeting.started`, `meeting.ended`, `meeting.participant_joined`, `meeting.participant_left`.
- Traitement : réponse 200 immédiate, stockage brut, puis message Messenger `ProcessZoomEvent` ; dédoublonnage sur (instance, participant_uuid, type, horodatage).
- Rapprochement du participant : `registrant_id` d'abord, puis email, puis nom normalisé ; sinon `role = inconnu` et signalement à l'équipe.

### Filet de sécurité et rapports

- Job `ReconcileZoomPresence` toutes les 5 min pendant une classe : compare l'état local aux participants en cours, corrige les événements manqués.
- En fin d'instance : `GET /v2/past_meetings/{id}/instances` puis `GET /v2/report/meetings/{uuid}/participants` (UUID double-encodé s'il commence par `/` ou contient `//`), stockés comme log officiel de la demi-journée. L'API rapports demande une licence Zoom payante.

## Moteur de notifications

Chaque envoi est un message Messenger qui relit l'état réel au moment de partir : une relance devenue inutile (PS reconnecté, classe déplacée) est annulée sans envoi.

### Déclencheurs

| Déclencheur | Mécanisme | Condition vérifiée à l'exécution | Canal |
| --- | --- | --- | --- |
| J-3, J-1 | Scheduler quotidien (heure configurable) | Session active, inscription active | Mail |
| Jour J | Scheduler, 1 h avant le premier créneau | Idem | Mail |
| T-5 min | Scheduler chaque minute : créneaux débutant dans 5 min | PS non connecté | SMS + mail |
| Déconnexion +3 min | Message différé (`DelayStamp` 180 s) créé sur `participant_left` | PS toujours déconnecté, créneau en cours | SMS + mail |
| Déconnexion +8 min | Message différé 480 s | Idem | SMS + mail |
| Déconnexion +10 min | Message différé 600 s | Idem | `Alerte` + push Mercure |
| Relance manuelle | Bouton fiche PS | Aucune ; `envoye_par` = utilisateur | Au choix |

- Idempotence : clé unique (inscription, déclencheur, créneau, numéro de déconnexion) sur `MessageEnvoye` ; un doublon est ignoré.
- Aucun envoi automatique de SMS hors 08:00–20:00.
- Rendu des modèles : Twig en mode sandbox, variables en liste blanche ; aperçu dans le back-office avant enregistrement.

### SMS — OVHcloud

- API OVHcloud (`ovh/ovh` PHP), envoi par job SMS du service, expéditeur = `Organisme.sms_sender` validé chez OVH.
- Messages transactionnels sans mention STOP (à confirmer avec OVH selon l'usage déclaré).
- Numéros normalisés en E.164 (`libphonenumber`) à l'inscription ; un numéro invalide est signalé sur la fiche PS.
- Contrôle de longueur : 160 caractères GSM-7, sinon alerte dans l'aperçu ; lien court sur un domaine de la marque (`/l/{code}` servi par l'API, redirection 302 vers le `join_url`).
- Statut de remise récupéré auprès d'OVH et reporté dans `MessageEnvoye.statut`.

### Mails — SMTP Google Workspace

- Symfony Mailer, un transport par organisme (`smtp://...@smtp.gmail.com:587` avec mot de passe d'application, ou relais SMTP Workspace).
- Quotas Google par boîte à vérifier au regard du volume ; envoi lissé par le worker.
- SPF, DKIM et DMARC configurés sur chaque domaine expéditeur.
- Version texte + HTML, identifiant de message stocké dans `MessageEnvoye.provider_id`.

## Présence temps réel

La présence est recalculée à chaque événement Zoom à partir du journal `PresenceEvent`, puis poussée au dashboard par Mercure en moins de quelques secondes.

### Calcul

1. Reconstituer les intervalles connectés d'un PS sur un créneau (paires join / leave ; un join sans leave court jusqu'à maintenant ou jusqu'à `meeting.ended`).
2. Fusionner les intervalles qui se chevauchent (connexions multiples, double appareil).
3. Rogner sur la plage de référence : créneau prévu ou durée réelle de la réunion, selon la règle ANDPC retenue (paramètre global `presence.base`).
4. `duree_cumulee` = somme des intervalles ; `taux` = duree_cumulee / durée de référence ; `nb_deconnexions` = nombre de leave suivis d'un join.
5. Le statut d'attestation proposé dépend du seuil `presence.seuil_attestation` : sous le seuil, l'envoi est bloqué sauf forçage tracé dans l'audit.

Le calcul est une fonction pure du domaine, testée unitairement sur des cas réels (dont ceux de la session 013 : 22 %, 18 %, réunion de 4 h 41).

### Mercure

| Topic | Contenu | Abonnés |
| --- | --- | --- |
| `/sessions/{id}/presence` | Synthèse d'un PS modifiée (connecté, durée, taux, déconnexions) | Page de suivi de la classe |
| `/dashboard` | Compteurs globaux des classes en cours | Dashboard |
| `/alertes` | Ouverture et clôture d'une alerte 10 min | Tous les utilisateurs de rôle suivi |

- Abonnements privés : cookie JWT Mercure émis par l'API selon le rôle.
- Au chargement, le front lit l'état par l'API REST puis applique les mises à jour Mercure ; à la reconnexion il relit l'état (pas de dépendance à l'historique du hub).

### Alertes

- Ouverte par le message différé de 10 min si le PS est toujours déconnecté ; fermée automatiquement à la reconnexion ou par un utilisateur (« appelé »), avec auteur et heure.
- Côté front : badge clignotant et son (Web Audio, activé après une première interaction utilisateur, contrainte des navigateurs), lien `tel:` pour le click-to-call.

## API REST

API Platform expose les ressources en JSON (format JSON-LD/Hydra par défaut, OpenAPI sur `/api/docs`) ; les actions métier passent par des opérations dédiées, jamais par une simple modification de champ.

| Méthode | Route | Rôle minimum | Effet |
| --- | --- | --- | --- |
| POST | `/api/auth/login`, `/api/auth/2fa` | — | Session (cookie httpOnly) + second facteur |
| GET, POST, PATCH, DELETE | `/api/organismes`, `/api/formations`, `/api/creneaux`, `/api/formateurs` | ADMIN (lecture : SUIVI) | Référentiels |
| GET, POST, PATCH | `/api/comptes-zoom` | SUPER_ADMIN | Secrets jamais renvoyés en lecture ; bouton « tester la connexion » |
| GET, POST, PATCH | `/api/templates` | ADMIN | Modèles mail et SMS, aperçu |
| GET | `/api/sessions?from=&to=&organisme=&formateur=&compteZoom=` | LECTURE | Calendrier et liste |
| POST | `/api/sessions` | SUIVI | Création : allocation des comptes (synchrone), création Zoom (asynchrone) ; 409 si aucun compte libre |
| POST | `/api/sessions/{id}/deplacer` | SUIVI | Nouvelle date ou nouveaux créneaux : suppression + recréation Zoom, renvoi des liens |
| DELETE | `/api/sessions/{id}` | ADMIN | Suppression Zoom puis annulation (soft delete) |
| GET, POST, DELETE | `/api/sessions/{id}/inscriptions` | SUIVI | Inscrits ; un ajout déclenche l'inscription Zoom |
| POST | `/api/sessions/{id}/inscriptions/import` | SUIVI | Import CSV (phase 1), Zoho (phase 2) |
| GET | `/api/sessions/{id}/presence` | LECTURE | État de présence courant par créneau |
| GET | `/api/inscriptions/{id}/messages` | LECTURE | Historique mails et SMS |
| POST | `/api/inscriptions/{id}/relance` | SUIVI | Relance manuelle (canal, modèle) |
| GET, POST | `/api/alertes`, `/api/alertes/{id}/traiter` | SUIVI | Alertes 10 min |
| GET | `/api/audit-logs?utilisateur=&entite=&from=&to=` | ADMIN | Journal |
| POST | `/webhooks/zoom/{compteZoomId}` | Signature Zoom | Événements Zoom |
| GET | `/l/{code}` | Public | Lien court vers le `join_url` |

- Erreurs au format RFC 7807 (`application/problem+json`) avec un code métier stable (`NO_ZOOM_ACCOUNT_AVAILABLE`, `CAPACITY_REACHED`, `ZOOM_SYNC_PENDING`...).
- Pagination, filtres et tri standard API Platform ; dates en ISO 8601, stockées en UTC, affichées en Europe/Paris.

## Sécurité, rôles et audit

Comptes nominatifs uniquement, second facteur obligatoire pour les administrateurs, et chaque action qui modifie une donnée ou envoie un message laisse une trace.

| Rôle | Droits |
| --- | --- |
| SUPER_ADMIN | Tout, dont comptes Zoom, utilisateurs et paramètres globaux |
| ADMIN | Référentiels, modèles de messages, suppression de classes, journal d'audit |
| SUIVI | Création et déplacement des classes, inscriptions, relances, traitement des alertes |
| LECTURE | Consultation du calendrier, des classes et des fiches PS |

- **Authentification** : session Symfony par cookie httpOnly, `SameSite=Lax`, front et API sur le même domaine ; TOTP via `scheb/2fa-bundle` ; verrouillage après 5 échecs (rate limiter Symfony).
- **Autorisations** : voters Symfony sur chaque ressource et opération ; filtrage par organisme possible si un utilisateur ne doit voir qu'une marque.
- **Audit** : listener Doctrine (`onFlush`) qui écrit `AuditLog` pour toute création, modification (diff des champs) et suppression ; connexions, échecs de connexion, envois manuels et forçages d'attestation journalisés explicitement. Table en ajout seul, jamais modifiée par l'application.
- **Secrets** : `APP_SECRET`, clés OVH, clé de chiffrement en Symfony Secrets (coffre chiffré par environnement) ; secrets Zoom chiffrés en base.
- **Webhooks** : signature vérifiée avant tout traitement, limite de débit, corps brut conservé 7 jours pour diagnostic.
- **En-têtes** : HTTPS uniquement (HSTS), CSP stricte côté front, CORS fermé (même origine).
- **RGPD** : données PS limitées au besoin (identité, contact, RPPS, adresse pour les attestations), hébergement en France, durées de conservation paramétrées par type (logs de présence, messages, audit) selon la règle ANDPC à confirmer, export et suppression d'un PS sur demande.

## Infrastructure, déploiement et exploitation

Deux environnements identiques (recette et production) sur VPS en France, déployés par Docker Compose, sans infogérance : la supervision et les sauvegardes sont automatisées dans la stack.

### Services Docker

| Service | Image | Rôle | Redémarrage |
| --- | --- | --- | --- |
| `php` | FrankenPHP + application | API, front compilé, hub Mercure, TLS automatique | always |
| `worker` | Même image | `messenger:consume async scheduler_default` (Zoom, SMS, mails, relances) | always, `--time-limit=3600` |
| `database` | postgres:16 | Données | always |
| `redis` | redis:7 | Files Messenger, cache des jetons Zoom, verrous | always |
| `backup` | restic (cron) | Sauvegardes chiffrées vers stockage objet | always |

### Déploiement

1. Push sur `main` : CI (GitHub Actions ou GitLab CI) lance tests, analyse statique (PHPStan), build des images.
2. Images poussées dans un registre privé, tag = SHA du commit.
3. Recette : déploiement automatique (`docker compose pull && up -d`, migrations Doctrine).
4. Production : même image, déclenchement manuel après validation de la recette ; retour arrière = redéploiement du tag précédent.
5. Mises en production hors des créneaux de classe (le worker termine ses messages en cours avant arrêt).

### Sauvegardes et reprise

- `pg_dump` quotidien + fichiers générés (attestations, factures en phase 2), chiffrés par restic vers un stockage objet S3 en France, rétention 30 jours.
- Test de restauration mensuel sur l'environnement de recette.
- Objectifs proposés : perte de données max 24 h, remise en service en moins de 4 h (réinstallation du VPS + restauration).

### Supervision

- Disponibilité : sonde HTTP externe sur `/health` (API, base, Redis, worker actif) avec alerte mail.
- Erreurs applicatives : Sentry (ou équivalent auto-hébergé).
- Logs JSON (Monolog) avec identifiant de corrélation par requête et par message Messenger.
- Tableau de bord interne : messages en échec, file Messenger, dernier événement Zoom reçu par compte.

## Points techniques à valider en recette

Ces points sont à vérifier sur un compte Zoom réel avant de figer le développement ; chacun a une solution de repli.

- [ ] **Option A Zoom** : une réunion planifiée terminée à la mi-journée puis relancée produit bien deux instances distinctes, les liens d'inscription restent valides l'après-midi, et le rapport de participants est disponible par instance. Repli : option B.
- [ ] **Démarrage sans hôte** : la réunion démarre-t-elle quand le formateur (invité) se connecte, ou faut-il lancer l'hôte ? Impact sur l'heure de début réelle et sur le calcul de présence.
- [ ] **Rôle du formateur** : partage d'écran et gestion des participants possibles en simple invité ou co-hôte à attribuer ; attribution automatisable ou non.
- [ ] **Nom affiché** : le Prénom NOM issu de l'inscription est-il bien imposé et non modifiable par le PS ?
- [ ] **Webhooks** : délai réel de réception de `participant_left` lors d'une coupure réseau (impact sur la relance à 3 min).
- [ ] **Licences Zoom** : plan des 3 comptes compatible avec l'API rapports et les inscriptions.
- [ ] **OVHcloud** : validation des expéditeurs SOFIA et PHOCEA, statut transactionnel sans mention STOP, récupération des accusés de remise.
- [ ] **Google Workspace** : quotas d'envoi par boîte compatibles avec les pics (J-1 de plusieurs classes le même jour).
- [ ] **Zoho** : édition et accès API de Zoho CRM et Zoho Sign (statut des attestations).
- [ ] **Reprise de l'existant** : accès à la base actuelle pour importer l'historique, sinon démarrage à vide.
- [ ] **Règles ANDPC** : base de calcul du taux de présence et seuil d'attestation (paramètres `presence.base` et `presence.seuil_attestation`).
