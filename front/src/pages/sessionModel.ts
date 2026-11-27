export type Org={id:number;name:string;code?:string;color?:string|null;active?:boolean}
export type FormationRef={id:number;title:string;reference?:string|null;fundingTypes:string[];defaultCapacity:number;active:boolean;organization:{id:number};additionalOrganizations?:{id:number}[]}
export type SessionFormation={
  id:number;formation:FormationRef;capacity:number;fundingNumbers:Record<string,string>|string[]
  accessStartsOn?:string|null;accessEndsOn?:string|null;effectiveAccessStartsOn:string;effectiveAccessEndsOn:string
  registeredCount?:number
  classes?:{id:number;date:string;status:'PLANNED'|'IN_PROGRESS'|'DONE'|'CANCELLED';reference?:string|null}[]
}
export type Session={id:number;organization:Org;name:string;startsOn:string;endsOn:string;sessionFormations:SessionFormation[];deletedAt?:string|null}

/** « 2030-11-01 » shown as « 01/11/2030 », without any time zone shift. */
export const day=(iso:string)=>iso.slice(0,10).split('-').reverse().join('/')
export const today=()=>new Date().toLocaleDateString('sv-SE')
export const phases={upcoming:'À venir',running:'En cours',over:'Terminée'}
export const phaseOf=(session:{startsOn:string;endsOn:string},now=today()):keyof typeof phases=>now<session.startsOn?'upcoming':now>session.endsOn?'over':'running'
export type Attendance={classId:number;date:string;label:string;seconds:number;expected:number;upcoming:boolean}
export type Registration={
  id:number;funding?:string|null;accessStartsOn?:string|null;accessEndsOn?:string|null;effectiveAccessStartsOn:string;effectiveAccessEndsOn:string
  participant:{id:number;firstName:string;lastName:string;email:string;phone?:string|null;rpps?:string|null};attendance:Attendance[]
}
export type RegistrationList={session:{id:number;name:string};formation:{title:string;fundingTypes:string[]};capacity:number;accessStartsOn:string;accessEndsOn:string;registrations:Registration[]}
