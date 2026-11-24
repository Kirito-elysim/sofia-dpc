import { useEffect, useRef, useState } from "react";
import { Copy, Mail, MessageSquare, Phone, Send, X } from "lucide-react";
import { type LiveClass, type LiveState } from "./liveTypes";
import { api } from '../api'

export type Target = { id: string; name: string; role: "Apprenant" | "Formateur"; state: LiveState; joinUrl?: string; phone?: string; email?: string; profession?: string };
const STATE: Record<LiveState, string> = { connected: "Connecté", waiting: "Pas encore arrivé", left: "Parti en cours de séance" };
const hm = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dial = (p: string) => p.replace(/[^\d+]/g, "");

/** Messages types selon la situation ; modifiables avant l'envoi. */
function templates(c: LiveClass, t: Target[], now: number): { label: string; text: string }[] {
  const title = c.title.replace(/^classe virtuelle\s*[—–-]?\s*/i, ""), link = t.length===1 ? t[0].joinUrl : undefined, live = now >= c.start;
  const first = t.length === 1 ? t[0].name.split(" ")[0] : "";
  const hi = first ? `Bonjour ${first},` : "Bonjour,";
  if (t[0].role === "Formateur") return [
    { label: "Demander de lancer la salle", text: `${hi} la classe « ${title} » ${live ? "a commencé" : `démarre à ${hm(c.start)}`} et ${c.participants.filter((p) => p.state === "connected").length} apprenant(s) attendent déjà. Pouvez-vous lancer la salle ? Merci.` },
    { label: "Message libre", text: `${hi} ` },
  ];
  const all = [
    t.some((x) => x.state === "left") && { label: "Revenir dans la classe", text: `${hi} nous avons vu que vous avez quitté la classe « ${title} ». Vous pouvez la rejoindre à nouveau${link ? ' : '+link : ' depuis votre invitation'}\nRappel : votre présence du début à la fin de la séance est nécessaire.` },
    live ? { label: "La classe a commencé", text: `${hi} la classe virtuelle « ${title} » a commencé. Vous pouvez la rejoindre ici${link ? ' : '+link : ' depuis votre invitation'}` } : { label: "Rappel avant le début", text: `${hi} rappel : la classe virtuelle « ${title} » démarre à ${hm(c.start)}. Lien de connexion${link ? ' : '+link : ' depuis votre invitation'}` },
    { label: "Aide technique", text: `${hi} rencontrez-vous un souci pour vous connecter à « ${title} » ? Répondez-nous et nous vous aidons. Lien${link ? ' : '+link : ' depuis votre invitation'}` },
    { label: "Message libre", text: `${hi} ` },
  ].filter(Boolean) as { label: string; text: string }[];
  return all;
}

/** Fiche de contact d'un participant, du formateur ou d'un groupe (« relancer les absents ») et actions de relance. */
export function VcContactPanel({ targets, cls, canSend, onClose }: { targets: Target[]; cls: LiveClass; canSend:boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [openedAt]=useState(()=>Date.now());
  const tpl = templates(cls, targets, openedAt);
  const [pick, setPick] = useState(0);
  const [text, setText] = useState(tpl[0].text);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const one = targets.length === 1 ? targets[0] : null;
  const add = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${s}`, ...l]);
  const subject = `Classe virtuelle : ${cls.title.replace(/^classe virtuelle\s*[—–-]?\s*/i, "")}`;
  const emails = targets.map((t) => t.email).filter(Boolean) as string[];
  const mailto = one ? `mailto:${one.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` : `mailto:?bcc=${emails.map(encodeURIComponent).join(",")}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  async function platform(kind: "e-mail" | "SMS") {
    setBusy(true);
    try {
      const rcpt = targets.filter((t) => (kind === "SMS" ? t.phone : t.email));
      for (const t of rcpt) {
        try {
          await api('/live-presence/classes/'+cls.id+'/contact',{method:'POST',body:JSON.stringify({target:t.id,channel:kind==='SMS'?'SMS':'MAIL',body:text})});
          add(kind+' transmis pour '+t.name);
        } catch (error) { add(t.name+' · '+(error instanceof Error?error.message:'Transmission échouée')); }
      }
    } finally { setBusy(false); }
  }
  const canMail=canSend, canSms=canSend;
  const nSms = targets.filter((t) => t.phone).length, nMail = emails.length;

  return (
    <dialog ref={ref} className="me-dialog vc-panel" aria-labelledby="vc-c-title" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <header>
        <div><span className="eyebrow">{one ? one.role.toUpperCase() : "RELANCE GROUPÉE"}</span>
          <h2 id="vc-c-title">{one ? one.name : `${targets.length} apprenants à relancer`}</h2>
          <p>{one ? <><span className={`vl-badge is-${one.state}`}>{STATE[one.state]}</span> · {cls.title.replace(/^classe virtuelle\s*[—–-]?\s*/i, "")}</> : cls.title}</p></div>
        <button type="button" className="icon-button" aria-label="Fermer" onClick={() => ref.current?.close()}><X size={18} /></button>
      </header>

      {one ? (
        <dl className="vl-contact">
          {one.profession && <><dt>Profession</dt><dd>{one.profession}</dd></>}
          <dt>Téléphone</dt><dd>{one.phone ? <a href={`tel:${dial(one.phone)}`}>{one.phone}</a> : <em>non renseigné</em>}</dd>
          <dt>E-mail</dt><dd>{one.email ? <a href={`mailto:${one.email}`}>{one.email}</a> : <em>non renseigné</em>}</dd>
        </dl>
      ) : <ul className="vl-targets">{targets.map((t) => <li key={t.id}>{t.name}<small>{STATE[t.state]}{!t.email && !t.phone && " · aucune coordonnée"}</small></li>)}</ul>}

      <h3 className="ep-sub">Message</h3>
      <label>Modèle<select value={pick} onChange={(e) => { setPick(+e.target.value); setText(tpl[+e.target.value].text); }}>{tpl.map((x, i) => <option key={x.label} value={i}>{x.label}</option>)}</select></label>
      <label className="sr-only" htmlFor="vl-text">Texte du message</label>
      <textarea id="vl-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} />

      <h3 className="ep-sub">Actions</h3>
      <div className="vl-actions">
        {one && <a className={`secondary ${one.phone ? "" : "is-disabled"}`} aria-disabled={!one.phone} href={one.phone ? `tel:${dial(one.phone)}` : undefined} onClick={() => add("Appel lancé depuis votre téléphone")}><Phone size={15} />Appeler</a>}
        {one && <a className={`secondary ${one.phone ? "" : "is-disabled"}`} aria-disabled={!one.phone} href={one.phone ? `sms:${dial(one.phone)}?body=${encodeURIComponent(text)}` : undefined} onClick={() => add("SMS préparé dans votre téléphone")}><MessageSquare size={15} />SMS (mon téléphone)</a>}
        <a className={`secondary ${nMail ? "" : "is-disabled"}`} aria-disabled={!nMail} href={nMail ? mailto : undefined} onClick={() => add("E-mail préparé dans votre messagerie")}><Mail size={15} />E-mail (ma messagerie)</a>
        <button type="button" className="primary" disabled={busy || !canMail || !nMail} onClick={() => platform("e-mail")}><Send size={15} />E-mail depuis la plateforme{!one && ` (${nMail})`}</button>
        <button type="button" className="primary" disabled={busy || !canSms || !nSms} onClick={() => platform("SMS")}><Send size={15} />SMS depuis la plateforme{!one && ` (${nSms})`}</button>
        <button type="button" className="link-button" disabled={!one?.joinUrl} onClick={() => { navigator.clipboard?.writeText(one?.joinUrl ?? "").then(() => add("Lien de connexion copié")).catch(() => {}); }}><Copy size={14} />Copier le lien de connexion</button>
      </div>
      {!canSend && <p>Les envois depuis Sofia sont réservés aux équipes de suivi.</p>}
      {log.length > 0 && <><h3 className="ep-sub">Historique (cet écran)</h3><ul className="vl-log">{log.map((l, i) => <li key={i}>{l}</li>)}</ul></>}
      <p className="card-hint">Coordonnées réservées aux organisateurs habilités (données personnelles).</p>
    </dialog>
  );
}
