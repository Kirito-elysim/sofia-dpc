# Les sessions (proposition validée le 27 novembre 2026)

27 novembre 2026. Basée sur la demande de l'utilisateur et sur la lecture du code du projet `platform`.

## 1. En une phrase

Une **session** est une période (début, fin). On y rattache une ou plusieurs formations : chaque rattachement est une
**session-formation**, dans laquelle on inscrit les PS et on range les classes virtuelles et les ressources.

```
Session « Novembre 2026 » (SOFIA, du 01/11 au 30/11)
└── Session-formation : Éducation thérapeutique du patient
    ├── Accès : du 01/11 au 30/11 (hérité de la session, modifiable)
    ├── N° de session DPC : 013
    ├── Classes virtuelles : 0, 1 ou plusieurs
    │   └── 14/11 : matin (formateur A) + après-midi (formateur B)
    ├── Ressources : celles de la formation, plus d'éventuels ajouts
    └── Inscriptions : les PS
        └── PS : financement, statut, accès (hérité, prolongeable), présence par créneau
```

## 2. Les quatre objets

| Objet | Ce qu'on saisit | Obligatoire |
|---|---|---|
| Session | libellé, organisme, début, fin | organisme, début, fin |
| Session-formation | formation, capacité, numéro de session par financement, dates d'accès si différentes | formation |
| Classe virtuelle | date, créneaux, formateur par créneau ; compte Zoom attribué automatiquement | au moins un créneau |
| Inscription | PS, financement, dates d'accès si différentes | PS |

## 3. Une seule règle pour l'accès

> Dates d'accès d'un PS = celles de son inscription, sinon celles de la session-formation, sinon celles de la session.

L'écran affiche toujours la date retenue et sa provenance (« héritée de la session »).

## 4. Ce qui est simplifié par rapport à `platform`

| Dans `platform` | Proposé |
|---|---|
| Dates de phases (FC, EPP) sur la session | un début et une fin ; les étapes plus tard si besoin |
| Colonnes DPC, FIFPL, OPCO et quatre états sur la session-formation | un numéro par financement coché sur la formation |
| Dates d'accès recopiées sur chaque inscription, cas particuliers dans le code | héritage, avec exception explicite |
| Financement porté par la session et par l'inscription | porté par l'inscription seulement |
| Inscription possible sur une formation sans session | toujours dans une session-formation |

## 5. Ce que cela change dans Sofia

- Le cahier des charges et `CLAUDE.md` disent « une session = une seule classe virtuelle ». Cette règle serait remplacée.
  Reste vrai : une classe a plusieurs créneaux, un formateur par créneau, présence par demi-journée.
- La classe virtuelle appartient à une session-formation ; elle ne porte plus la formation ni les numéros DPC saisis à la main.
- L'inscription passe de la classe à la session-formation. La capacité aussi.
- Seule une formation **publiée**, portée par l'organisme de la session, peut être rattachée.
- Les écrans « Classes », l'inscription, les relances et le planning sont à adapter. Les données existantes sont à migrer.
- Il n'existe pas d'espace apprenant : les dates d'accès et les ressources seraient enregistrées sans que le PS puisse
  encore les consulter. Espace apprenant et ressources dépassent la phase 1 du cahier des charges.

## 6. Ordre de développement proposé

1. Sessions et session-formations (liste, création, fiche).
2. Classes virtuelles dans une session-formation (reprise de la planification et de Zoom).
3. Inscriptions des PS, accès et présence.
4. Ressources et espace apprenant, après décision.

## 7. Réponses de l'utilisateur

1. Les classes virtuelles d'une session-formation sont **toutes à suivre**.
2. Une même classe virtuelle **peut réunir plusieurs session-formations**.
3. Les ressources et l'accès en ligne du PS sont **à faire**, à leur tour dans l'ordre ci-dessus.

## 8. Avancement

- [x] 1. Sessions et session-formations (liste, création, fiche).
- [x] 2. Classes virtuelles dans les session-formations (une classe ne réunit que des sessions du même organisme).
- [x] 3. Inscriptions, accès et présence.
- [ ] 4. Ressources et espace apprenant. À définir avant : mode de connexion du PS.
