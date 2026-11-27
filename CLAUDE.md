# SOFIA / PHOCEA — Outil de gestion des classes virtuelles

## Contexte
Refonte de l'outil de suivi des classes virtuelles Zoom de deux organismes de formation DPC (ANDPC) :
**SOFIA** et **STUDIO PHOCEA** (deux sociétés distinctes, mêmes modèles de documents, logos différents).
Le cahier des charges complet est dans `docs/cahier-des-charges.md` : il fait foi. Les maquettes validées sont dans `docs/maquettes/`.

Phase en cours : **phase 1** (parité avec l'outil actuel + création automatique des classes Zoom, calendrier,
suivi temps réel, relances SMS/mail, journal d'audit). La phase 2 (logs Zoom, documents DPC, facturation, Zoho CRM,
analytique) ne doit PAS être développée : seulement visible dans le menu avec un badge « Bientôt ».

## Règles métier clés
- Une **session** est une période (début, fin) d'un organisme. Chaque formation qu'on y rattache forme une
  **session-formation** : les PS s'y inscrivent, elle porte la capacité, les numéros de session par financement et les
  dates d'accès (héritées de la session sauf exception). Voir `docs/proposition-sessions.md`.
- Une session-formation a 0 à n classes virtuelles, **toutes à suivre** ; une même classe virtuelle peut réunir plusieurs
  session-formations. Une classe a plusieurs **créneaux** (matin 09:00–13:00, après-midi 14:00–17:00),
  un **formateur par créneau**. Les PS sont comptés **une fois** par classe.
- Présence tracée **par créneau / demi-journée** (exigence ANDPC).
- 3 comptes Zoom ; un compte = une seule réunion à la fois. Allocation automatique d'un compte libre par créneau ;
  si aucun compte libre → création bloquée + message + mail à l'admin.
- Capacité par défaut 20 PS (paramétrable par formation).
- Espace apprenant (`/espace`) : le PS se connecte par un lien e-mail à usage unique ; il n'est pas un `User` et sa
  session n'ouvre que `/api/portal/`.
- Rôles : SUPER_ADMIN, ADMIN, SUIVI, LECTURE.
- Relances : mail J-3, J-1, jour J ; SMS + mail à T-5 min aux non-connectés ; SMS + mail à +3 min et +8 min
  après une déconnexion ; alerte dashboard (visuelle + sonore) à +10 min.
- Toute action (connexion, création/modif/suppression de classe, envoi, relance) est écrite dans le journal d'audit.
- Points encore ouverts (ne pas figer en dur, rendre paramétrable) : seuil de présence pour l'attestation,
  mode de génération du lien formateur, montage Zoom exact (une réunion par créneau ou réunion relancée).

## Stack
- `api/` : Symfony 7 + API Platform, PHP 8.3, Doctrine, PostgreSQL 16, Redis, Messenger (workers), Mercure (temps réel).
- `front/` : React + TypeScript + Vite, Tailwind CSS, React Router, TanStack Query, lucide-react ;
  calendrier : FullCalendar (vues jour / semaine / mois).
- `docker-compose.yml` à la racine : php, nginx/caddy, postgres, redis, mercure, worker, front (dev).
- SMS : OVHcloud (expéditeur par organisme). Mails : SMTP Google Workspace (une adresse par organisme).
- Hébergement cible : serveur Docker en France.

## Conventions
- Code et noms techniques en anglais ; textes de l'interface en **français**.
  Exception validée : l'entité de formation s'appelle `Formation` (table `formation`, API `/api/formations`), pas `Training`.
- Entités principales : Organization, Formation, Session, SessionFormation, TimeSlot, Trainer, ZoomAccount, User, VirtualClass, ClassSlot,
  Participant (PS), Enrollment, AttendanceEvent, MessageTemplate, MessageLog, AuditLog.
- Statuts de classe (liste fermée) : PLANNED « Planifiée », IN_PROGRESS « En cours », DONE « Terminée », CANCELLED « Annulée ».
- Aucune suppression définitive : toute entité étend `SoftDeletable` (colonne `deleted_at`) et une suppression
  renseigne cette date. Seule exception : le journal d'audit, en ajout seul et jamais supprimé.
- Aucune donnée réelle de PS dans le code, les fixtures ou les tests : données fictives uniquement.
- Secrets uniquement en variables d'environnement (`.env.local`, jamais commités).
- Avant de considérer une tâche terminée : lint + tests + build passent.

## Design (maquette Planning validée)
Couleurs relevées sur la maquette, approximatives, à affiner :
- Sidebar : bleu nuit `#0A2552` ; item actif et bouton primaire : bleu `#1557F5`.
- Fond de page : `#F8FAFC` ; texte principal : `#1E2347`.
- SOFIA : bleu (`#1E6BF0`, fond clair `#E8F2FD`) ; STUDIO PHOCEA : **violet** partout (`#9B51E0`).
- Statuts : Planifiée bleu clair, En cours orange (`#F59E0B`), Terminée vert (`#2E9E44`), Annulée rouge (`#E5484D`).
- Layout : sidebar fixe à gauche (menu principal, Paramétrage repliable, Journal d'audit, entrées phase 2 grisées « Bientôt »),
  topbar (recherche, notifications, utilisateur + rôle), sélecteur d'organisme Tous / SOFIA / STUDIO PHOCEA.
- Composants réutilisables : KpiCard, StatusBadge, OrganizationBadge, FilterSelect, ClassCard (calendrier), Legend.
