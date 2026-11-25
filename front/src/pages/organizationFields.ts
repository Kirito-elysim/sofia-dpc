export const establishmentNumber = {label:'SIREN ou SIRET', pattern:'(?:[0-9]{9}|[0-9]{14})', hint:'9 ou 14 chiffres', inputMode:'numeric'} as const

export const organizationColors = [['blue','Bleu SOFIA'],['purple','Violet Phocea'],['gray','Gris']]

export const fields=[
  [['name','Nom de l’organisme','Ex. SOFIA Santé & Formation'],['code','Code','Ex. SOF'],['legalForm','Forme juridique'],['siret',establishmentNumber.label,establishmentNumber.hint],['andpcNumber','N° ANDPC','Ex. 1234'],['numberAPE','Code APE','Ex. 8559A'],['numberFormationDPC','N° de déclaration d’activité'],['active','Statut'],['color','Couleur d’identification']],
  [['address','Adresse'],['addressExtra','Complément d’adresse'],['zipCode','Code postal'],['city','Ville'],['phone','Téléphone principal'],['email','E-mail de contact'],['responsible','Responsable de l’organisme'],['url','Site web','https://']],
  [['billingName','Raison sociale de facturation'],['billingAddress','Adresse de facturation'],['billingZip','Code postal'],['billingCity','Ville'],['billingEmail','E-mail de facturation'],['billingPhone','Téléphone de facturation'],['numberTVA','N° TVA intracommunautaire'],['iban','IBAN'],['bic','BIC']],
  [['smsSender','Expéditeur SMS','Ex. SOFIADPC'],['emailFrom','E-mail d’envoi'],['replyEmail','E-mail de réponse'],['contactName','Nom du contact principal'],['contactPhone','Téléphone du contact']],
]
export const optional=['numberAPE','siret','legalForm','numberFormationDPC','addressExtra','url',...fields[2].map(([key])=>key)]
export const options:Record<string,string[]>={legalForm:['Association','SAS','SASU','SARL','EURL','Entreprise individuelle','Autre']}
export const types:Record<string,string>={email:'email',billingEmail:'email',replyEmail:'email',emailFrom:'email',url:'url',phone:'tel',billingPhone:'tel',contactPhone:'tel'}
export const preferences=[['operational','Recevoir les notifications opérationnelles','Informations de fonctionnement (sessions, inscriptions, incidents, etc.).'],['news','Autoriser les communications SOFIA','Actualités, mises à jour produits et bonnes pratiques.'],['alerts','Recevoir les alertes administratives','Rappels d’échéances, pièces à fournir et suivi de conformité.']]
export const docs=[['logo','Logo'],['signature','Signature'],['stamp','Cachet'],['kbis','Kbis'],['qualiopi','Certificat Qualiopi'],['rib','RIB'],['declaration','Justificatif de déclaration d’activité']]


export const fieldHelp: Record<string, string> = {
  name: 'Nom officiel utilisé dans Sofia et sur les documents.',
  code: 'Identifiant unique, ex. SOF. De 2 à 20 caractères, en majuscules, chiffres ou avec un tiret bas.',
  legalForm: 'Statut juridique indiqué dans les documents de l’organisme.',
  siret: 'SIREN à 9 chiffres ou SIRET à 14 chiffres, si disponible.',
  andpcNumber: 'Identifiant attribué à l’organisme par l’ANDPC.',
  numberAPE: 'Code de l’activité principale, si disponible.',
  numberFormationDPC: 'Numéro de déclaration d’activité de formation.',
  active: 'Un organisme actif peut être sélectionné pour les nouvelles classes.',
  color: 'Couleur associée à l’organisme dans Sofia.',
  address: 'Numéro et nom de rue de l’adresse principale.',
  addressExtra: 'Bâtiment, étage ou autre précision d’adresse.',
  zipCode: 'Code postal de l’adresse principale.',
  city: 'Commune de l’adresse principale.',
  phone: 'Numéro auquel joindre l’organisme.',
  email: 'Adresse utilisée pour les demandes générales.',
  responsible: 'Nom et prénom de la personne responsable de l’organisme.',
  url: 'Adresse complète du site, en commençant par https://.',
  billingName: 'Nom légal à faire figurer sur les factures.',
  billingAddress: 'Numéro et rue à faire figurer sur les factures.',
  billingZip: 'Code postal de l’adresse de facturation.',
  billingCity: 'Commune de l’adresse de facturation.',
  billingEmail: 'Adresse à laquelle envoyer les factures.',
  billingPhone: 'Numéro à joindre pour les questions de facturation.',
  numberTVA: 'Identifiant de TVA, si l’organisme en possède un.',
  iban: 'Numéro du compte bancaire indiqué sur le RIB.',
  bic: 'Identifiant de la banque indiqué sur le RIB.',
  smsSender: 'Nom affiché comme expéditeur du SMS, jusqu’à 11 lettres ou chiffres.',
  emailFrom: 'Adresse qui apparaît comme expéditeur des e-mails.',
  replyEmail: 'Adresse qui reçoit les réponses aux e-mails envoyés.',
  contactName: 'Nom et prénom de la personne référente pour les communications.',
  contactPhone: 'Numéro direct de la personne référente.',
  logo: 'Logo utilisé sur les documents de l’organisme.',
  signature: 'Image de la signature du responsable.',
  stamp: 'Image du cachet officiel de l’organisme.',
  kbis: 'Extrait d’immatriculation de l’organisme.',
  qualiopi: 'Certificat de conformité Qualiopi de l’organisme.',
  rib: 'Relevé d’identité du compte bancaire de l’organisme.',
  declaration: 'Accusé de réception de la déclaration d’activité.',
}
