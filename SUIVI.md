# SUIVI — avancement (mettre à jour à chaque tâche : cocher, dater, noter le commit)

Légende : [x] fait · [~] partiel · [ ] à faire. Dernière mise à jour : 2026-11-24.

## Phase 1

### Socle
- [x] Dépôt git, monorepo `api/` + `front/` + `docker/`, docker-compose dev (php FrankenPHP, worker, postgres 16, redis, mailpit, front)
- [x] Symfony 7.4 + API Platform + Doctrine + Messenger (Redis) + Mailer ; PHPStan niveau 6 ; PHPUnit
- [x] Front React/TS/Vite/Tailwind/TanStack Query ; layout sidebar (entrées phase 2 « Bientôt ») ; Vitest ; oxlint
- [x] Auth par session (login/logout/me), rôles hiérarchisés, limitation des tentatives
- [ ] 2FA TOTP (scheb/2fa-bundle) obligatoire pour ADMIN / SUPER_ADMIN
- [x] Gestion des utilisateurs dans l'UI (SUPER_ADMIN) ; commande `app:user:create` pour le premier compte
- [ ] Mercure (temps réel), CI (GitHub Actions/GitLab), `compose.prod.yaml`, sauvegardes restic (point `/health` livré)
- [ ] php-cs-fixer configuré (paquet installé, pas de règle ni de passage CI)

### Système d'inscription (premier chantier, commencé)
- [x] Entités Organization, Training, VirtualClass, Participant, Enrollment, MessageLog, AuditLog, User + migration
- [x] Inscrire / annuler / lister les PS d'une classe ; capacité, doublons, classe fermée ; verrou anti-concurrence
- [x] Mail de confirmation via Messenger + Symfony Mailer (Mailpit en dev, Gmail via `.env.local`) ; `MessageLog`
- [x] Écran liste des classes et écran classe (formulaire d'inscription, annulation)
- [x] Tests : 3 fonctionnels PHPUnit (capacité, doublon, annulation, rôles, validation), 2 Vitest
- [ ] **Vérifier l'envoi réel via Gmail** (mot de passe d'application) — non testé
- [ ] Import CSV des inscrits (`POST /api/virtual-classes/{id}/enrollments/import`)
- [x] Fiche PS : historique `MessageLog`, relance manuelle (`POST /api/enrollments/{id}/relance`)
- [ ] Normalisation E.164 du téléphone, contrôle RPPS plus fin
- [ ] Gabarits de mail éditables par organisme (`MessageTemplate`, Twig sandbox) — aujourd'hui en dur dans `templates/email/`
- [ ] Auto-inscription publique par le PS (non demandée : à valider avec le client avant de coder)

### Référentiels et classes
- [x] CRUD Organisation (SIRET, n° ANDPC, expéditeurs mail/SMS, actif), Formation (capacité par défaut), Créneau, Formateur (formations assurées), Utilisateur + rôle — API + écrans, tests PHPUnit
- [ ] Logo d'organisme (upload) ; lien formateur ↔ créneau de classe
- [~] CRUD Compte Zoom (SUPER_ADMIN, secrets chiffrés libsodium, bouton « tester la connexion »), Modèles de messages (aperçu)
- [x] Écran et API de consultation du journal d’audit (ADMIN)
- [ ] Mot de passe oublié / changement de son propre mot de passe ; liste des utilisateurs filtrable
- [x] Création de classe (formulaire) : `ClassSlot` (créneaux + formateur par créneau), capacité par défaut de la formation
- [~] Allocation automatique d'un compte Zoom libre + contrainte d'exclusion PostgreSQL (btree_gist) ; 409 + mail admin si aucun
- [ ] Déplacement / suppression d'une classe (recréation / suppression Zoom, renvoi des liens)
- [~] Planning calendrier React connecté à l’API ; objectif initial FullCalendar (jour/semaine/mois), filtres, KPI (maquette `docs/maquettes/planning.png`)

### Zoom, présence, relances
- [~] Client Zoom Server-to-Server OAuth (jeton en cache Redis), création de réunions, inscription des PS (`join_url` → `Enrollment.joinUrl`)
- [~] Webhooks Zoom (signature, `endpoint.url_validation`), `AttendanceEvent`, calcul de présence (fonction pure testée)
- [ ] Relances : mail J-3/J-1/jour J, T-5 min, +3/+8 min après déconnexion, alerte +10 min (visuelle + sonore) ; pas de SMS 20h–8h
- [ ] SMS OVHcloud (expéditeur par organisme), liens courts `/l/{code}`
- [x] Journal d’audit : listener Doctrine, connexions/échecs, demandes de relance et consultation ADMIN

## Phase 2 — NE PAS DÉVELOPPER
Logs Zoom automatiques, documents DPC, facturation, Zoho CRM/Sign, analytique : uniquement visibles « Bientôt » dans le menu.

## Décisions et points ouverts (ne pas figer en dur)
- Seuil de présence pour l'attestation, base de calcul du taux, lien formateur (hôte/co-hôte), option Zoom A vs B : paramétrables.
- Gmail comme expéditeur provisoire : une seule adresse pour les deux organismes tant que les boîtes Workspace n'existent pas.
- Entités à plat dans `src/Entity` (écart assumé avec la doc technique) ; client API front écrit à la main.
- Pas de conservation/purge RGPD ni export/suppression d'un PS pour l'instant.

## Journal
- 2026-11-24 (2) : CRUD des référentiels (organismes, formations, créneaux, formateurs, utilisateurs/rôles) + audit Doctrine automatique. **Les classes virtuelles viennent en dernier** (demande du client) : calendrier, création de classe, Zoom et relances restent à faire après le paramétrage.
- 2026-11-24 : initialisation du dépôt, socle API/front, système d'inscription + mail de confirmation (Mailpit vérifié de bout en bout).

- [x] Compte formateur (ROLE_FORMATEUR) + « Mes classes » (2026-11-24)
- [ ] Rôles staff par organisme (ex. ADMIN sur SOFIA, LECTURE sur PHOCEA) : non fait, à confirmer avec le client

- 2026-11-24 (3) : Ouverture externe chez Zoom, plusieurs comptes hôtes, OAuth par profil et cache Redis, réservation transactionnelle multi-créneaux, worker de provisionnement, alerte de saturation et planning connecté. Voir le bilan détaillé dans HANDOFF.md pour les contrôles et les limites de recette.

- Suivi en direct : cumul de présence par apprenant sur les créneaux en cours, fusion multi-appareils et signalement visuel après dix minutes de déconnexion. Test fonctionnel PostgreSQL avec webhooks simulés. Recette Zoom réelle en attente.
