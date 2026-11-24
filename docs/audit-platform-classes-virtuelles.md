# Classes virtuelles Zoom · Audit de Platform et cahier des charges Sofia

## 1. Périmètre et compte rendu

Audit statique de la branche locale `MEDPHA-65` de Platform, au commit `06e009cef6f1bf792440e2daaae989158ea2e151`. Comparaison avec `e2f7aa4e9`, le commit immédiatement antérieur à la série Zoom examinée. La série compte 10 commits et touche 19 fichiers. Analyse en lecture seule. La recette sur des comptes Zoom réels reste à mener.

| Commits | Changements observés |
| --- | --- |
| 8320eeebd, 3b5130066 | Politique de création par configuration et instantané des paramètres de la réunion. |
| 4af882fc5, 6df6e22d7 | Accès invité sans inscription, exclusion de la présence nominative, affichage de la politique et du lien. |
| 49ce6c851, d3b2e7884, a0dda319a | Administration des paramètres, panneau partagé et identifiants masqués. |
| 16cb84211, 31029d62f, 06e009cef | Refonte du détail dans les deux back-offices, liens hôte et observateur à la demande, corrections du formulaire, de la gestion du code d’accès et du rapprochement des présences. |

## 2. Architecture et parcours observés

### Comptes et connecteurs

- L’administrateur associe une configuration Zoom active à un organisme. Le serveur utilise l’API Zoom avec OAuth serveur à serveur. Chaque réunion conserve sa configuration d’origine, y compris après archivage de celle-ci. La reprise des classes historiques possède une commande de rattachement dédiée. Certains traitements historiques peuvent utiliser les identifiants historiques de l’environnement.
- Lors de la création, le service récupère les hôtes disponibles auprès de Zoom et contrôle leurs réunions concurrentes sur la plage demandée. En cas de saturation, il renvoie un conflit et tente d’ouvrir un ticket Jira. Jira intervient dans l’escalade opérationnelle.
- Un composant historique produit aussi une signature d’intégration Zoom à partir du rôle. Les routes récentes savent récupérer des liens Zoom externes. La recherche ciblée dans le backend n’a identifié ni récepteur d’événements de présence Zoom ni connecteur Teams sur ce parcours.

Sources : [ZoomConfigsManager](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomConfigsManager.php:40), [ZoomService](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomService.php:113), [Sélection de l’hôte](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomService.php:1067), [Intégration historique](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomMeeting.php:17).

### Configuration des classes virtuelles dans le back-office

L’entrée **Administration → Configurations Zoom** propose une liste et un formulaire de création ou de modification. L’API sous `/administrator/zoom-configs` permet de lister, consulter, créer, modifier et archiver les configurations pour les rôles administrateur et super administrateur.

- **Périmètre.** Une configuration nommée peut être partagée par plusieurs organismes. Chaque organisme utilise une seule configuration active à la fois. Enregistrer la sélection réaffecte les organismes choisis et retire ceux désélectionnés de cette configuration. Une réunion reprend toujours la configuration enregistrée à sa création.
- **Identifiants.** Le formulaire distingue les trois identifiants OAuth serveur et les deux champs hérités de l’intégration Zoom. En lecture, l’API renvoie seulement des indicateurs `credentialsSet`. En modification, les champs d’identifiants laissés vides conservent leur valeur. Les champs hérités ne sont pas nécessaires au parcours externe visé dans Sofia.
- **Politique de création.** Les valeurs initiales sont : invité désactivé, protection par code désactivée, salle d’attente activée, arrivée avant l’hôte désactivée, enregistrement hérité du compte. Les choix d’enregistrement sont « hérité », « désactivé » et « cloud ».
- **Combinaisons validées.** Désactiver la salle d’attente exige un code. Rejoindre avant l’hôte exige que la salle d’attente soit désactivée. L’écran ajuste les options incompatibles et le serveur rejette les combinaisons invalides.
- **Détail de la classe.** Le panneau Zoom affiche la configuration actuelle et l’instantané de création avec les réglages demandés, les réglages effectifs et leurs écarts. Le code d’accès d’une réunion gérée par la politique s’affiche en lecture seule pour les personnes habilitées. Le lien invité est disponible quand ce mode a été confirmé par Zoom.
- **Créneaux.** Platform dispose aussi d’un référentiel de périodes avec ses propres actions de gestion. La période et l’affectation du formateur relèvent de la planification. La politique Zoom règle le comportement de la réunion.

Sources : [Formulaire de configuration](/Users/mahdjoub/www/platform/app/front/src/View/Administrator/ZoomConfigs/ZoomConfigs.js), [API d’administration](/Users/mahdjoub/www/platform/app/back/src/Controller/Administrator/ZoomConfigsController.php:18), [Affectation des organismes](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomConfigsManager.php:117), [Règles de validation](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomClassroomPolicy.php:90), [Référentiel des périodes](/Users/mahdjoub/www/platform/app/back/src/Controller/ContentManager/VirtualClassroom/VirtualClassroomPeriodController.php:22).

### Cycle de vie d’une classe

1. Le gestionnaire organise la classe à partir des formations, sessions et périodes. Le back-office peut affecter les formateurs par période.
2. La création lit la politique de l’organisme : accès invité, code d’accès, salle d’attente, arrivée avant hôte et enregistrement cloud, désactivé ou hérité.
3. Le serveur crée la réunion chez Zoom. Il peut relire les réglages réels. En mode invité, il exige la confirmation de l’accès anonyme et la présence du lien. En cas d’échec de cette confirmation, il tente de supprimer la réunion créée et remonte le résultat du nettoyage.
4. La classe conserve l’identifiant Zoom, la configuration d’origine et l’instantané des réglages effectifs. Le panneau distingue la politique actuelle du compte et les paramètres appliqués à la réunion. Une politique modifiée sert aux futures réunions.
5. Le dernier correctif omet le champ de mot de passe quand la protection est désactivée. Zoom peut encore imposer un code au niveau compte. L’écart est enregistré dans l’instantané.

Sources : [Création et rattachements](/Users/mahdjoub/www/platform/app/back/src/Controller/ContentManager/VirtualClassroom/VirtualClassroomController.php:494), [Politique](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomClassroomPolicy.php:133), [Création et compensation](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomService.php:250), [Panneau Zoom](/Users/mahdjoub/www/platform/app/front/src/Component/VirtualClassroomZoomPanel.js).

### Identités et liens

| Profil | Comportement dans Platform |
| --- | --- |
| PS inscrit | L’inscription doit être disponible, active, rattachée à une session et associée à un apprenant. Réutilisation du lien local confirmé, puis recherche de l’inscrit par e-mail chez Zoom, puis création si nécessaire. Stockage du `registrant_id` et du `join_url` par apprenant et par réunion. |
| Formateur | Affecté à la classe ou à la période, avec parcours dédié. Le lien hôte frais est une capacité privilégiée. La route récente observée le fournit aux gestionnaires autorisés dans le périmètre organisme. Elle ne suffit donc pas, à elle seule, à établir le parcours hôte d’un formateur Sofia. |
| Observateur | Le gestionnaire demande un lien personnel. Le service réutilise ou crée une inscription technique Zoom et demande son approbation. Le rôle Zoom est celui d’un participant. Aucune inscription pédagogique n’est créée. Un identifiant déjà rattaché à un apprenant conserve son attribution apprenant. |
| Invité | En mode invité, lien partagé et aucune inscription Zoom nominative. Platform contrôle l’accès à la restitution du lien. Toute personne qui le possède peut ensuite ouvrir Zoom. Ce mode ne produit pas de présence pédagogique nominative. |

Sources : [Inscription et reprise](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomService.php:516), [Résolution du lien](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomService.php:623), [Liens hôte et observateur](/Users/mahdjoub/www/platform/app/back/src/Controller/ContentManager/VirtualClassroom/VirtualClassroomController.php:385), [Formateurs](/Users/mahdjoub/www/platform/app/back/src/Controller/Former/FormerController.php).

### Présence, sondages et attestations

- La commande `cron:zoom-participant-logs` récupère les instances passées d’une réunion, parcourt les participants paginés et rapproche les lignes avec les inscriptions locales. Elle ignore les invités et observateurs non rattachés à un PS. Elle crée des enregistrements `LearnerTimer` de type CV et évite les doublons sur les mêmes intervalles.
- L’écriture d’un timer valide peut marquer la classe comme réalisée dans l’inscription. Ce comportement ne constitue pas une règle de seuil de présence à reprendre telle quelle pour une attestation.
- Les modèles de sondage sont rattachés aux formations et synchronisés vers les réunions. Le traitement post-séance rapproche également les résultats Zoom des inscrits connus. Le code contient des vues de résultats et des modèles PDF d’attestation.

Sources : [Import post-séance](/Users/mahdjoub/www/platform/app/back/src/Cron/ZoomParticipantLogsCommand.php:78), [Rapprochement des réponses](/Users/mahdjoub/www/platform/app/back/src/Cron/ZoomParticipantLogsCommand.php:493), [Synchronisation des sondages](/Users/mahdjoub/www/platform/app/back/src/Service/ZoomPollSyncService.php:27).

## 3. Cahier des charges d’intégration dans Sofia

### Périmètre et socle existant

Le périmètre cible retenu est Sofia. Conserver Zoom externe, la création par créneau, l’allocation hôte transactionnelle, les inscriptions PS par créneau, les webhooks signés, le suivi en direct et les modèles de rappel. Intégrer les apports de Platform via les services Sofia. Le mode invité, les sondages et Jira sont des lots optionnels qui nécessitent une validation métier. Le mode nominatif est obligatoire pour les séances à présence opposable.

### Exigences et critères de recette

| Réf. | Exigence | Recette minimale |
| --- | --- | --- |
| CV-01 | Associer un organisme à ses profils OAuth et à son pool d’hôtes. Réserver localement l’hôte sur l’intervalle et contrôler ses conflits Zoom externes. Figer le profil et l’hôte sur chaque réunion. Protéger les secrets côté serveur. | Deux sessions simultanées réservent deux hôtes. Une troisième renvoie un conflit explicite. Une modification d’association laisse les réunions existantes joignables. |
| CV-02 | Définir la politique des nouvelles réunions par organisme. Stocker l’instantané demandé et effectif avec code, salle d’attente, arrivée avant hôte et enregistrement. Afficher les écarts et protéger les changements de mode quand des PS sont déjà inscrits. | Paramètre Zoom imposé visible après relecture. Modification de la politique limitée aux prochaines créations. |
| CV-03 | Fournir un lien unique par PS et par créneau. Réutiliser un inscrit Zoom confirmé en cas de reprise. Pour un résultat distant ambigu, relire Zoom avant un nouvel appel de création. Annulation locale suivie de la révocation distante avec état visible. | Deux PS et deux créneaux donnent quatre liens distincts. Relance du worker, timeout après acceptation et webhook rejoué conservent les mêmes inscriptions. Le lien révoqué disparaît de Sofia. |
| CV-04 | Maintenir les rôles PS, formateur et observateur. Le formateur affecté lance la séance via un droit hôte validé. Récupérer le lien hôte à la demande avec contrôle du périmètre et audit. Observer via un lien distinct et empêcher l’attribution automatique d’une présence pédagogique. | Un PS et un gestionnaire d’un autre organisme sont refusés sur la route hôte. Le formateur apparaît séparément et l’observateur ne crédite aucune présence PS. |
| CV-05 | Consolider arrivées et départs par webhook avec signature, compte d’origine, déduplication et identifiant nominatif prioritaire. Après séance, importer les rapports Zoom paginés pour rattraper les événements manquants. Conserver la provenance, les divergences et les identités non résolues. | Arrivée sans e-mail reconnue par identifiant Zoom. Événement désordonné traité. Deux appareils simultanés comptent une seule fois. Import rejouable sans double durée. |
| CV-06 | Calculer le temps éligible sur l’union des intervalles bornés au créneau. Définir le seuil d’attestation par règle validée par l’organisme. Stocker durée, seuil, résultat et raison d’une éventuelle correction manuelle. | Tester juste sous le seuil, au seuil et au-dessus. Un import incomplet laisse l’attestation en attente de validation. |
| CV-07 | Conserver les rappels Sofia. Résoudre le lien nominatif du bon créneau, vérifier l’inscription et la condition de connexion à l’échéance, conserver un suivi par destinataire. Attribuer à Zoom ou à Sofia la responsabilité de chaque invitation pour éviter les doubles envois. | Tester e-mail J−5 et SMS T−5 sous condition de présence. Deux passages donnent un seul envoi par règle. Le rapprochement des journaux montre le canal et le résultat. |
| CV-08 | Exposer dans les écrans la liste des créneaux, les intervenants, les statuts nominaux, les anomalies Zoom, les actions autorisées et le résultat de la réconciliation. Réserver les liens personnels aux titulaires et aux gestionnaires habilités. | Un gestionnaire diagnostique une inscription bloquée, la différence entre réglage demandé et appliqué, et un défaut d’import post-séance depuis le détail. |
| CV-09 | Prévoir une reprise idempotente des réunions historiques et un mode de recette isolé. Journaliser compte original introuvable, conflit d’hôte, échec d’inscription, échec de réconciliation et délai du worker. Exclure secrets et URL d’accès des journaux. | Recette sur compte Zoom dédié, avec deux PS et un formateur de test. Le tableau de recette vérifie livraison, ouverture de liens, rapprochement et résultat d’attestation. |

### Exigences détaillées pour l’écran de configuration Sofia

| Réf. | Comportement attendu | Recette |
| --- | --- | --- |
| CONF-01 | Ajouter dans Paramétrage une vue « Configurations des classes virtuelles » avec liste, détail et édition. Une configuration définit la politique de création et référence le pool des comptes hôtes. Afficher les organismes concernés et réserver la modification aux administrateurs habilités. | Un administrateur peut affecter deux organismes au même profil de configuration. Un compte de lecture ne peut pas enregistrer une modification. |
| CONF-02 | Réutiliser le stockage serveur des secrets et exposer leur présence. Valider les rattachements et signaler les organismes réaffectés avant l’enregistrement. Garder une configuration archivée résoluble pour ses réunions historiques. | Un champ secret vide conserve la valeur existante. La réponse de détail ne contient aucun secret. L’archivage empêche une nouvelle affectation tout en préservant l’accès des réunions existantes. |
| CONF-03 | Afficher les dépendances code, salle d’attente et arrivée anticipée. Les valider également côté API. Garder le mode nominatif par défaut dans Sofia. | Sans code et sans salle d’attente, l’API retourne une erreur portant sur la salle d’attente. Avec salle d’attente et arrivée avant hôte, l’API retourne une erreur portant sur l’arrivée anticipée. |
| CONF-04 | Afficher sur le détail d’un créneau la politique demandée, les valeurs confirmées par Zoom et tout écart. Indiquer quand les réglages effectifs restent à confirmer. Protéger les codes et liens par les droits du créneau. | Un code imposé par Zoom apparaît en écart. Si Zoom ne fournit pas les réglages effectifs, l’écran indique « à confirmer ». Après édition du profil, un créneau existant garde son instantané et le prochain hérite des nouvelles valeurs. |

### Ordre de réalisation

1. **Comptes et accès** — Correspondance organisme/profil, instantané, attribution des hôtes, récupération du lien formateur et contrôles d’accès.
2. **Inscription et distribution** — Reprise par recherche distante, révocation robuste, état de synchronisation et test du circuit d’invitation.
3. **Présence finale** — Rapprochement des rapports avec les webhooks, preuve de présence et règle d’attestation.
4. **Options** — Observateur en supervision, mode invité pour les séances non nominatives, sondages et routage Jira selon les besoins confirmés.

### Décisions à valider avant implémentation

- Le formateur démarre-t-il via son propre compte Zoom, via délégation hôte ou via un lien remis par Sofia aux formateurs affectés ?
- Quels seuils, règles d’arrondi, plages horaires éligibles et délais de clôture s’appliquent par organisme ?
- Qui envoie l’invitation initiale et les liens de remplacement ? Paramétrer clairement Zoom ou Sofia pour chaque message.
- Quels organismes peuvent activer invités, observateurs et enregistrement, et quelle conservation appliquer aux données de suivi ?
- Quels droits, licences et réglages verrouillés sont disponibles sur le compte hôte de recette ? Les contrôler avant d’activer l’intégration réelle.

### Points à vérifier en recette

Disponibilité et concurrence sur les hôtes Zoom, comportement d’un compte qui impose un code ou une authentification, validité du lien hôte, révocation et réinscription, livraison effective des liens, reprise après échec réseau et visibilité des rapports à la fin d’une séance. Le comportement observé dans le code et la réussite de ces scénarios en conditions réelles sont deux éléments de validation distincts.
