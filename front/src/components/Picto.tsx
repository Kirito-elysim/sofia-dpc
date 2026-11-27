import {BookOpen,Activity,ArrowUpDown,Bell,Brain,Briefcase,Building2,CalendarCheck,CalendarDays,CalendarRange,CalendarX,CircleCheck,CircleHelp,Clock,GraduationCap,HeartPulse,Lightbulb,Link2,Pill,Search,ShieldCheck,Tag,Trash2,TriangleAlert,Unplug,UserRound,Users,Video,type LucideIcon} from 'lucide-react'
import './picto.css'

const icons={
  book:BookOpen,activity:Activity,sort:ArrowUpDown,bell:Bell,brain:Brain,briefcase:Briefcase,building:Building2,calendar:CalendarDays,week:CalendarRange,upcoming:CalendarCheck,cancelled:CalendarX,
  done:CircleCheck,help:CircleHelp,clock:Clock,formation:GraduationCap,heart:HeartPulse,idea:Lightbulb,link:Link2,pill:Pill,search:Search,shield:ShieldCheck,tag:Tag,trash:Trash2,warning:TriangleAlert,
  unplug:Unplug,trainer:UserRound,users:Users,video:Video,
} satisfies Record<string,LucideIcon>

export type PictoName=keyof typeof icons

/** The single pictogram theme of Sofia: line icons, a pale blue disc for page headings and indicators. */
export function Picto({name,className=''}:{name:PictoName;className?:string}) {
  const Icon=icons[name]
  return <Icon className={'picto '+className} aria-hidden="true"/>
}
