import { useState } from "react";
import { AlertTriangle, Radio, Send, UserCheck, UserX } from "lucide-react";
import { type LiveClass, type LiveState } from "./liveTypes";
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import './liveClasses.css'
import { type Target, VcContactPanel } from "./VcContactPanel";

const LABEL: Record<LiveState, string> = { connected: "Connecté", waiting: "Pas encore arrivé", left: "Parti" };
const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
const hm = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const count = (c: LiveClass, s: LiveState) => c.participants.filter((p) => p.state === s).length;

/** Écran « En direct » : toutes les classes en cours ou sur le point de commencer, et qui est connecté. */
export function LiveClasses({canSend}:{canSend:boolean}) {
  const [sel, setSel] = useState<{ cid: string; ids: string[] | "trainer" } | null>(null);
  const {data:list=[],dataUpdatedAt:now,isLoading,error}=useQuery({queryKey:['live-classes'],queryFn:()=>api<LiveClass[]>('/live-presence/classes'),refetchInterval:5000})
  const live = list.filter((c) => now >= c.start && now < c.start + c.durationMin * 60000);
  const soon = list.filter((c) => now < c.start);
  const online = live.reduce((s, c) => s + count(c, "connected"), 0) + live.filter((c) => c.trainerConnected).length;

  return (
    <section className="vl" aria-label="Classes virtuelles en direct">
      <div className="vl-sum">
        <span className="vl-dot" aria-hidden /><strong>{live.length} classe{live.length > 1 ? "s" : ""} en direct</strong>
        <span>{online} personne{online > 1 ? "s" : ""} connectée{online > 1 ? "s" : ""}</span>
        {soon.length > 0 && <span>{soon.length} démarre{soon.length > 1 ? "nt" : ""} bientôt</span>}
        <ul className="vl-legend" aria-label="Légende">
          <li className="is-connected"><i />Connecté</li><li className="is-waiting"><i />Pas encore arrivé</li><li className="is-left"><i />Parti en cours de séance</li>
        </ul>
      </div>
      {isLoading && <p>Chargement des classes…</p>}
      {error && <p role="alert">{error.message}</p>}
      <div className="vl-grid">
        {[...live, ...soon].map((c) => {
          const isLive = now >= c.start, con = count(c, "connected"), wait = count(c, "waiting"), left = count(c, "left"), n = c.participants.length;
          const elapsed = Math.max(0, Math.min(1, (now - c.start) / (c.durationMin * 60000)));
          const min = Math.round((now - c.start) / 60000);
          const alerts = [
            isLive && !c.trainerConnected && "Le formateur n'est pas encore connecté.",
            isLive && min >= 5 && n > 0 && con / n < 0.6 && `Seulement ${con} présent${con > 1 ? "s" : ""} sur ${n} inscrits.`,
            left > 0 && `${left} apprenant${left > 1 ? "s" : ""} parti${left > 1 ? "s" : ""} en cours de séance.`,
          ].filter(Boolean) as string[];
          return (
            <article key={c.id} className={`vl-card ${alerts.length ? "has-alert" : ""} ${isLive ? "" : "is-soon"}`}>
              <header>
                <div><h3>{c.title.replace(/^classe virtuelle\s*[—–-]?\s*/i, "")}</h3>
                  <p className={`vl-trainer ${c.trainerConnected ? "on" : "off"}`}>{c.trainerConnected ? <UserCheck size={14} aria-hidden /> : <UserX size={14} aria-hidden />}<button type="button" className="vl-link" onClick={() => setSel({ cid: c.id, ids: "trainer" })}>{c.trainer}</button> · {c.trainerConnected ? "formateur connecté" : "formateur absent"}</p></div>
                <div className="vl-count" aria-label={`${con} connectés sur ${n} inscrits`}><strong>{con}</strong><span>/ {n}</span></div>
              </header>
              <p className="vl-time">{isLive ? <><Radio size={13} aria-hidden />En direct depuis {hm(c.start)} · {min} min sur {c.durationMin}</> : `Démarre à ${hm(c.start)} (dans ${Math.max(1, Math.round((c.start - now) / 60000))} min)`}</p>
              {isLive && <div className="vl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed * 100)} aria-label="Avancement de la séance"><span style={{ width: `${elapsed * 100}%` }} /></div>}
              <ul className="vl-people" aria-label="Participants">
                {c.participants.map((p) => <li key={p.id} className={`is-${p.state}`}><button type="button" title={`${p.name} : ${LABEL[p.state]} — cliquer pour contacter`} aria-label={`${p.name} : ${LABEL[p.state]}. Ouvrir la fiche de contact`} onClick={() => setSel({ cid: c.id, ids: [p.id] })}>{initials(p.name)}</button></li>)}
              </ul>
              <p className="vl-tally">{con} connecté{con > 1 ? "s" : ""} · {wait} pas encore arrivé{wait > 1 ? "s" : ""}{left > 0 && ` · ${left} parti${left > 1 ? "s" : ""}`}</p>
              {wait + left > 0 && <button type="button" className="secondary vl-relance" onClick={() => setSel({ cid: c.id, ids: c.participants.filter((p) => p.state !== "connected").map((p) => p.id) })}><Send size={14} />Relancer les {wait + left} absent{wait + left > 1 ? "s" : ""}</button>}
              {alerts.length > 0 && <ul className="vl-alerts">{alerts.map((a) => <li key={a}><AlertTriangle size={14} aria-hidden />{a}</li>)}</ul>}
            </article>
          );
        })}
      </div>
      {(() => {
        const c = sel && list.find((x) => x.id === sel.cid);
        if (!sel || !c) return null;
        const targets: Target[] = sel.ids === "trainer"
          ? [{ id: "trainer", name: c.trainer, role: "Formateur", state: c.trainerConnected ? "connected" : "waiting", ...c.trainerContact }]
          : c.participants.filter((p) => (sel.ids as string[]).includes(p.id)).map((p) => ({ id: p.id, name: p.name, role: "Apprenant" as const, state: p.state, phone: p.phone, email: p.email, joinUrl:p.joinUrl, profession: p.profession }));
        return targets.length ? <VcContactPanel key={`${sel.cid}-${targets.map((t) => t.id).join()}`} targets={targets} cls={c} canSend={canSend} onClose={() => setSel(null)} /> : null;
      })()}
      {!error && !isLoading && live.length + soon.length === 0 && <div className="ml-empty"><Radio size={30} /><strong>Aucune classe en direct</strong><p>Les sessions apparaissent ici 30 minutes avant leur début.</p></div>}
    </section>
  );
}
