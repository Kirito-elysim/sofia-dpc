/** French names of what the audit trail records: entity class names, then API path segments. */
export const resources:Record<string,string>={
  Organization:'Organisme',Formation:'Formation',TargetAudience:'Public cible',Trainer:'Formateur',TimeSlot:'Créneau',User:'Utilisateur',
  VirtualClass:'Classe virtuelle',ClassSlot:'Créneau de classe',Participant:'Participant (PS)',Enrollment:'Inscription',ZoomAccount:'Compte Zoom',
  MessageTemplate:'Modèle de message',CustomRole:'Rôle',
  // Rows written before « Training » became « Formation » (the audit trail is never rewritten).
  Training:'Formation',trainings:'Formation',
  organizations:'Organisme',formations:'Formation','target-audiences':'Public cible',trainers:'Formateur','time-slots':'Créneau',users:'Utilisateur',
  'virtual-classes':'Classe virtuelle','scheduled-classes':'Planification de classe',enrollments:'Inscription','zoom-accounts':'Compte Zoom',
  'message-templates':'Modèle de message','custom-roles':'Rôle','virtual-class-configs':'Configuration de classe virtuelle',
  'organization-profiles':'Fiche organisme','zoom-oauth':'Connexion Zoom','live-presence':'Suivi en direct',auth:'Authentification',
}
export const actions:Record<string,string>={
  CREATE:'Création',UPDATE:'Modification',DELETE:'Suppression',ARCHIVE:'Archivage',REQUEST_FAILED:'Action refusée',
  LOGIN_SUCCESS:'Connexion',LOGIN_FAILURE:'Échec de connexion',LOGOUT:'Déconnexion',MANUAL_REMINDER:'Relance manuelle',ZOOM_PROVISION:'Configuration Zoom',
  ACCESS_SENT:'Envoi des accès',IMPERSONATION_START:'Début de prise de compte',IMPERSONATION_STOP:'Fin de prise de compte',LIVE_CONTACT:'Contact en direct',
  TRAINER_DOCUMENT_SAVED:'Document formateur enregistré',TRAINER_DOCUMENT_DELETED:'Document formateur supprimé',
}
export const fields:Record<string,string>={
  name:'Libellé / nom',acronym:'Acronyme',title:'Titre',label:'Libellé',email:'E-mail',firstName:'Prénom',lastName:'Nom',phone:'Téléphone',
  organization:'Organisme',organizations:'Organismes',additionalOrganizations:'Organismes associés',targetAudience:'Public cible',trainer:'Formateur',
  description:'Description',objectives:'Objectifs pédagogiques',orientation:'Orientation',modality:'Type de programme',publicationStatus:'Statut de publication',
  active:'Actif',archived:'Archivé',deletedAt:'Supprimé le',fundingTypes:'Financements',andpcCodes:'Codes ANDPC',thumbnail:'Visuel',
  totalDurationMin:'Durée (min)',defaultCapacity:'Capacité',customReference:'Référence personnalisée',reference:'Référence',startTime:'Début',endTime:'Fin',
  status:'Statut',date:'Date',capacity:'Capacité',code:'Code',roles:'Rôles',
}
export function readable(value:unknown):string{
  if(value===null||value===undefined||value==='')return '—'
  if(typeof value==='boolean')return value?'Oui':'Non'
  if(Array.isArray(value))return value.length?value.map(readable).join(', '):'—'
  if(typeof value==='object'){
    const o=value as {id?:number;label?:string}
    return o.id!==undefined?(o.label?o.label+' (#'+o.id+')':'#'+o.id):JSON.stringify(value)
  }
  // ISO date-times from the API are shown in French.
  if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value))return new Date(value).toLocaleString('fr-FR')
  return String(value)
}
