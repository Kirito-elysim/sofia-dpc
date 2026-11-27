# SOFIA / PHOCEA — Refonte outil classes virtuelles : préconisation technique & cahier des charges

2026-11-18 · Mohamed Mahdjoub

> Version pour le dépôt de code : les noms des PS cités dans l'audit ont été remplacés par « PS A », « PS B », « PS C ».

## Synthèse

L'outil actuel affiche les données Zoom mais ne pilote rien : les classes virtuelles sont créées à la main, les envois ne sont pas tracés et le statut d'attestation ne dépend pas de la présence réelle. La refonte proposée reprend l'existant puis en fait l'outil central de SOFIA et STUDIO PHOCEA.

| Sujet | En bref |
| --- | --- |
| Phase 1 | Parité avec l'outil actuel, création automatique des classes sur un compte Zoom libre, calendrier, historique des messages, journal d'audit |
| Phase 2 | Logs Zoom automatiques, documents DPC et facturation par organisme, intégration Zoho CRM, analytique |
| Technologie | API Symfony, front React, déploiement Docker sur un serveur hébergé en France |
| Coût récurrent | Environ 145 à 175 € HT par mois, sans infogérance, hors abonnements existants (hypothèse haute de 100 SMS par jour) |
| À décider | Trois règles métier : calcul du taux de présence, seuil d'attestation, lien des formateurs |

## 1. Contexte

SOFIA et STUDIO PHOCEA sont deux sociétés distinctes : chacune émet ses propres factures et attestations, sur le même modèle avec un logo différent. STUDIO PHOCEA, en cours d'immatriculation, porte l'acquisition kiné ; SOFIA porte le reste.

| Indicateur | Valeur observée |
| --- | --- |
| Comptes Zoom | 3 (un compte = une classe virtuelle simultanée) |
| Classes virtuelles sur 14 jours | 20 (12 SOFIA, 8 PHOCEA) |
| PS par classe | 12 à 22 |
| Créneaux | Matin 09:00–13:00, après-midi 14:00–17:00 |
| Outils conservés | Zoho CRM, Zoho Sign, extranet ANDPC |

L'ANDPC exige des logs de présence par demi-journée, ce qui explique aujourd'hui la création de deux classes Zoom par session.

## 2. Constats de l'audit

L'outil actuel est un tableau de bord de suivi : il affiche la présence Zoom, mais ne crée rien, ne trace rien et ne contrôle pas la cohérence des statuts.

### Points critiques (session 013 du 14/11/2026)

- **Attestations signées avec une présence très faible** : le PS A a son attestation « Signée » avec 22 % de présence l'après-midi ; le PS B est « Présence confirmée » avec 18 % le matin. Le statut ne tient pas compte de la présence réelle : risque de conformité DPC.
- **Listes différentes pour une même session** : 19 PS attendus le matin, 20 l'après-midi ; le PS C n'apparaît que l'après-midi.
- **Base de calcul du taux de présence** : la durée réelle de la réunion (4 h 41 le matin) et non le créneau prévu de 240 minutes.

### Autres constats

| Domaine | Constat | Conséquence |
| --- | --- | --- |
| Création des classes | Saisie manuelle sur l'un des 3 comptes Zoom, deux classes par session | Erreurs de saisie, double travail |
| Synchronisation | Données Zoom récupérées toutes les 15 min | Une classe créée ou déplacée tard reste désynchronisée |
| Planning | Total « PS attendus » qui additionne matin et après-midi ; ni calendrier, ni formateur, ni compte Zoom, ni capacité affichés | Charge des comptes et des formateurs invisible |
| Suivi | Formateur non distingué des PS ; libellés incohérents (« À reprogue », statuts vides) | Lecture difficile en direct |
| Communications | Aucun historique des mails et SMS, pas de relance manuelle | Impossible de prouver qu'un PS a été prévenu |
| Attestations | Envoyées depuis Zoho CRM, sans auteur ni date dans l'outil | Aucune traçabilité |
| Journal | Pas de comptes nominatifs ni de trace des actions | Impossible de savoir qui a fait quoi |
| Références | « M-EFE2-CV » sans définition ; menu Analytique vide | — |
| Liens Zoom | Lien nominatif par PS, automatisation liée à une personne sortante ; lien formateur de génération inconnue | Process à reconstruire |
| Exploitation | Hébergeur, sauvegardes et plan de reprise inconnus | Aucune garantie en cas d'incident |

## 3. Solution proposée — phase 1

La phase 1 reprend l'outil actuel et supprime la saisie manuelle sur Zoom, première source d'erreurs. Tout est paramétrable dans un back-office.

### Back-office

| Référentiel | Contenu |
| --- | --- |
| Organismes | Raison sociale, SIRET, n° ANDPC, logo, nom d'expéditeur SMS, adresse mail d'envoi ; SOFIA et STUDIO PHOCEA, d'autres ajoutables |
| Formations | Titre, référence, organisme, durée, capacité par défaut (20 PS aujourd'hui) |
| Créneaux | Matin, après-midi ou tout autre créneau, avec horaires |
| Formateurs | Coordonnées, formations assurées |
| Comptes Zoom | Comptes disponibles pour l'allocation automatique |
| Utilisateurs | Comptes nominatifs et rôles |
| Messages | Textes des mails et SMS, par organisme et par déclencheur |

### Une classe, deux créneaux

> Évolution validée le 27 novembre 2026 : une session est désormais une période rattachée à des formations, avec 0 à n
> classes virtuelles (voir `proposition-sessions.md`). La description d'une classe ci-dessous reste valable.

Une session devient **une seule classe virtuelle** avec plusieurs créneaux (matin, après-midi), chacun avec son formateur. Les PS sont comptés une fois, et la présence reste tracée par demi-journée, comme l'exige l'ANDPC. Le montage Zoom exact (une réunion relancée par demi-journée, ou une réunion par créneau) sera arrêté après test.

### Création et cycle de vie d'une classe

1. L'utilisateur saisit l'organisme, la formation, l'action et la session DPC, la date, les créneaux, un formateur par créneau, la capacité et une référence si besoin.
2. L'outil choisit seul un compte Zoom libre sur chaque créneau et crée la réunion.
3. Si aucun compte n'est libre, la création est bloquée, un message s'affiche et l'administrateur reçoit un mail.
4. Chaque PS reçoit un lien unique qui l'affiche sous son Prénom NOM dans Zoom ; le formateur reçoit le sien.
5. Un déplacement supprime puis recrée la réunion Zoom et renvoie les nouveaux liens ; une suppression retire la réunion de Zoom.

### Planning et suivi

- Vue calendrier (mois, semaine, jour) en plus de la liste, filtrable par organisme, formateur et compte Zoom.
- Pour chaque classe : inscrits / capacité, formateur, compte Zoom, statut.
- Présence en temps réel transmise par Zoom (plus d'attente de 15 min), formateur distingué des PS.
- Alerte visuelle et sonore après 10 min de déconnexion, numéro du PS en click-to-call.
- Fiche PS : historique daté des mails et SMS avec statut de remise, connexions et déconnexions, relance manuelle.

### Communications automatiques

| Moment | Canal | Destinataire |
| --- | --- | --- |
| J-3, J-1, jour J | Mail | Tous les inscrits |
| 5 min avant le début | SMS + mail | PS pas encore connecté |
| 3 min après une déconnexion | SMS + mail | PS déconnecté |
| 8 min après une déconnexion | SMS + mail | PS toujours déconnecté |
| 10 min après une déconnexion | Alerte dashboard | Équipe suivi |

### Attestations et traçabilité

- Statut Zoho Sign affiché avec la date et l'auteur de l'envoi ; alerte si la présence est sous le seuil défini.
- Journal d'audit : connexions, créations, modifications et suppressions de classes, envois et relances, avec l'auteur et l'heure.

## 4. Phase 2 — Centralisation DPC et finance

La phase 2 couvre le parcours DPC de bout en bout, jusqu'au dépôt des demandes de solde. **Hors périmètre du développement actuel.**

- **Logs Zoom automatiques** : rapports de présence récupérés en fin de demi-journée et consolidés par PS, sans traitement manuel.
- **Documents par organisme** : attestations de participation, synthèses de suivi et factures générées au modèle et au logo de SOFIA ou de STUDIO PHOCEA.
- **Facturation** : automatisée à 99 %, suivi des règlements et des demandes de solde ; il ne reste qu'à déposer sur l'extranet ANDPC.
- **Inscriptions ANDPC** : automatisation de la validation des « inscriptions à traiter », selon la faisabilité technique d'accès à l'extranet.
- **Zoho CRM** : synchronisation des affaires vendues vers les classes, remontée des statuts (réalisée, attestation signée, désinscrit) vers le pipe suivi.
- **Analytique** : taux de présence, de signature et de déconnexion par organisme, formation, formateur et période ; chiffre d'affaires réalisé.

## 5. Architecture technique

Une API Symfony unique pilote Zoom, les SMS, les mails et Zoho ; un front React affiche le calendrier, le suivi en direct et le back-office. L'ensemble est déployé avec Docker sur un serveur hébergé en France. Le détail (modèle de données, intégration Zoom, API, sécurité) est dans `doc-technique.md`.

| Brique | Choix | Apport |
| --- | --- | --- |
| Backend | Symfony 7 + API Platform (PHP 8.3) | API documentée, sécurité et validation natives |
| Front | React + TypeScript | Calendrier, dashboard temps réel, back-office |
| Temps réel | Webhooks Zoom + Mercure | Présence affichée en quelques secondes |
| Traitements | Workers asynchrones | Création Zoom, SMS, mails et relances sans bloquer l'interface |
| Données | PostgreSQL + Redis | Données, historique, journal d'audit |
| SMS | OVHcloud, expéditeur SOFIA ou PHOCEA | Nom de l'organisme affiché sur le téléphone |
| Mails | SMTP Google Workspace, une adresse par marque | Aucun coût d'envoi |
| Exploitation | Sauvegarde quotidienne externalisée, supervision | Perte de données max 24 h, remise en service en moins de 4 h |

## 6. Contraintes d'exploitation

- SMS : OVHcloud, 160 caractères ; les liens de connexion sont raccourcis pour tenir dans un seul SMS.
- Aucun SMS automatique entre 20 h et 8 h.
- Les SMS ne partent qu'aux PS non connectés ou déconnectés.

## 7. Points à valider

Ces règles ne doivent pas être codées en dur : elles sont paramétrables en attendant la réponse du client.

### Prioritaires

| # | Question | Statut |
| --- | --- | --- |
| 1 | Quel seuil de présence minimal pour envoyer l'attestation et facturer ? | À valider |
| 2 | Comment le lien des formateurs est-il généré, et doivent-ils être hôte ou co-hôte ? | À valider |

### Métier

- Signification de la référence « M-EFE2-CV », qui la crée, caractère obligatoire.
- Liste complète des statuts apprenant et attestation, et qui les modifie.
- Capacité maximale : 20 PS pour toutes les formations ou variable (21 et 22 observés chez PHOCEA) ?
- Un PS peut-il suivre une seule demi-journée d'une session ?
- Marge à respecter entre deux classes sur un même compte Zoom ; nombre de comptes Zoom en cible.
- Source de référence des inscrits : extranet ANDPC, Zoho CRM, ou les deux.
- Contenu actuel des mails et SMS ; rôles des utilisateurs et droits associés.
- Durée de conservation exigée pour les logs et preuves de présence.
- STUDIO PHOCEA : SIRET et numéro ANDPC dès l'immatriculation.

### Technique

- Fournisseur SMS actuel et volume mensuel réel.
- Prestataire de l'outil actuel : reprise de l'historique souhaitée ou non ?
- Fonctionnement de l'automatisation actuelle des liens nominatifs Zoom.
- Édition Zoho CRM / Zoho Sign et accès API.
- Boîtes Google Workspace d'envoi par marque et accès DNS des domaines.
