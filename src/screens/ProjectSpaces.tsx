// Backlog, Documents, Équipe (rôles et mise en place), Mémoire.
import { useState } from 'react';
import {
  ArrowLeftRight, BookOpenCheck, Bug, CircleCheck, Code2, Download, Globe, Layout, Lock, MessageSquare, PenLine, Scale,
  Search, ShieldCheck, Telescope, TestTube2, Trash2, type LucideIcon,
} from 'lucide-react';
import { agentRoles, agents, audit, decisions, epics, interventions, roles, setupSteps } from '../mock/data';
import { Bar, Soon, StatePill, Tabs, fmtTokens, toolShort } from '../components/ui';
import { useNotify } from '../components/notify';
import { useStore } from '../store';
import { Reports } from './ProjectWork';
import type { Go } from '../view';

export function Backlog({ go }: { go: Go }) {
  const { tickets } = useStore();
  return (
    <div className="page">
      <h1>Backlog</h1>
      <p className="lead">Épopées, histoires et tickets. L’avancement est calculé par le programme.</p>
      {epics.map((e) => {
        const ids = e.stories.flatMap((s) => s.tickets);
        const done = ids.filter((id) => tickets.find((t) => t.id === id)?.status === 'termine').length;
        const pct = Math.round((done / ids.length) * 100);
        return (
          <section key={e.id} className="section" style={{ marginTop: 30 }}>
            <div className="section__head">
              <h2>{e.id} {e.title}</h2>
              <div className="progress" style={{ width: 220 }}><Bar value={pct} label={`Avancement ${e.title}`} tone="" thick /><span className="num">{pct} %</span></div>
            </div>
            <div className="box box--flush">
              {e.stories.map((s, i) => (
                <div key={s.title} style={{ padding: '14px 0', borderBottom: i < e.stories.length - 1 ? '1px solid var(--line)' : 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-strong)' }}>{s.title}</div>
                  <div className="row" style={{ gap: 6 }}>
                    {s.tickets.map((id) => {
                      const t = tickets.find((x) => x.id === id)!;
                      const tone = t.status === 'termine' ? 'ok' : t.status === 'action' ? 'wait' : t.status === 'en-cours' || t.status === 'a-tester' ? 'accent' : '';
                      return <button key={id} className={`pill ${tone ? `pill--${tone}` : ''}`} onClick={() => go({ kind: 'ticket', ticketId: id })}>{id} {t.title}</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type DocTab = 'cr' | 'audit' | 'decisions' | 'rapports' | 'fichiers';

export function Documents({ projectId, go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const { unreported } = useStore();
  const [tab, setTab] = useState<DocTab>('cr');
  const n = unreported(projectId).length;
  const total = audit.flaws.critique + audit.flaws.haute + audit.flaws.moyenne;
  return (
    <div className="page">
      <h1>Documents</h1>
      <p className="lead" style={{ marginBottom: 24 }}>Comptes rendus, audit du code, décisions et rapports. Consultables aussi par les agents.</p>
      <Tabs<DocTab> label="Documents" value={tab} onChange={setTab} tabs={[
        { id: 'cr', label: n > 0 ? `Comptes rendus (${n} à rapporter)` : 'Comptes rendus' }, { id: 'audit', label: 'Audit du code' }, { id: 'decisions', label: 'Décisions' }, { id: 'rapports', label: 'Rapports' }, { id: 'fichiers', label: 'Fichiers joints' },
      ]} />
      {tab === 'cr' && <Reports projectId={projectId} go={go} />}
      {tab === 'audit' && (
        <div className="report">
          <div className="report__head">
            <h2>Rapport d’audit du {audit.date}</h2>
            <button className="btn btn--sm" onClick={() => notify('Maquette : export HTML (J4).')}>HTML</button>
            <button className="btn btn--sm" onClick={() => notify('Maquette : export PDF (J4).')}>PDF</button>
          </div>
          <div className="box">
            <dl className="facts" style={{ gridTemplateColumns: '150px 1fr' }}>
              <dt>C’est quoi</dt><dd>{audit.what}</dd>
              <dt>Stack</dt><dd>{audit.stack}</dd>
              <dt>Bien fait</dt><dd>{audit.good}</dd>
              <dt>Failles</dt>
              <dd>
                <span className="sev sev--c">{audit.flaws.critique} critique</span>
                <span className="sev sev--h">{audit.flaws.haute} hautes</span>
                <span className="sev sev--m">{audit.flaws.moyenne} moyennes</span>
                <span className="faint xsmall">{total} au total, trouvées par {audit.flaws.tools}</span>
              </dd>
              <dt>Mauvaises habitudes</dt><dd>{audit.habits}</dd>
            </dl>
          </div>
          <div className="verdict"><CircleCheck size={18} /><span><strong>Verdict</strong> : {audit.verdictText}</span></div>
          <button className="btn btn--primary" onClick={() => notify('Maquette : 6 tickets proposés, doublons vérifiés, à valider avant création.')}>Créer le backlog à partir de l’audit</button>
        </div>
      )}
      {tab === 'decisions' && (
        <div className="report">
          {decisions.map((d) => (
            <div key={d.id} className="decision">
              <span className="tag" style={{ height: 24 }}>{d.id}</span>
              <div>
                <div className="strong">{d.title}</div>
                <div className="decision__forbid"><Lock size={12} style={{ verticalAlign: '-1px' }} /> Interdit vérifié par le programme : {d.forbids}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'rapports' && <Soon title="Rapports : bientôt" text="Rapports de lot, de sécurité, de tests et de version, en HTML et PDF. Arrive en J4." />}
      {tab === 'fichiers' && <Soon title="Fichiers joints : bientôt" text="Captures et maquettes jointes aux tickets ou au chat. Arrive en J5." />}
    </div>
  );
}

const ROLE_ICON: Record<string, LucideIcon> = {
  analyste: BookOpenCheck, architecte: Layout, 'dev-front': PenLine, 'dev-back': Code2, testeur: TestTube2,
  securite: ShieldCheck, redacteur: PenLine, eclaireur: Telescope, importateur: Download,
};
const IV_ICON = { verrou: Lock, bascule: ArrowLeftRight, message: MessageSquare, regle: Scale };

export function Team({ projectId, go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const [tab, setTab] = useState<'equipe' | 'mise' | 'agents'>('equipe');
  const team = agents.filter((a) => a.projectId === projectId);
  const setupTokens = setupSteps.reduce((s, x) => s + x.tokens, 0);

  return (
    <div className="page">
      <div className="section__head" style={{ marginBottom: 6 }}>
        <h1>Équipe</h1>
        <button className="btn" onClick={() => notify('Maquette : l’orchestrateur relance la mise en place. Scan gratuit d’abord, puis Éclaireur et Importateur seulement si besoin.')}>Refaire la mise en place</button>
      </div>
      <p className="lead" style={{ marginBottom: 24 }}>L’orchestrateur compose l’équipe selon le projet et lance chaque agent avec son rôle. Les messages entre agents passent par le programme, sans tokens.</p>

      <Tabs label="Équipe" value={tab} onChange={setTab} tabs={[{ id: 'equipe', label: 'Rôles' }, { id: 'mise', label: 'Mise en place' }, { id: 'agents', label: `Agents au travail (${team.length})` }]} />

      {tab === 'equipe' && (
        <>
          <div className="roles">
            {roles.filter((r) => r.kind === 'equipe').map((r) => {
              const Icon = ROLE_ICON[r.id] ?? Bug;
              const busy = team.filter((a) => agentRoles[a.id] === r.id);
              return (
                <div key={r.id} className="role">
                  <div className="role__head">
                    <span className="role__icon"><Icon size={16} /></span>
                    <span className="role__name">{r.name}</span>
                    {busy.length > 0 && <span className="pill pill--accent pill--dot" style={{ marginLeft: 'auto' }}>{busy.map((a) => a.ticketId).join(', ')}</span>}
                  </div>
                  <div className="role__mission">{r.mission}</div>
                  <div className="role__meta">
                    <span className="tag">{toolShort(r.tool)} {r.model}</span>
                    {r.skills.map((s) => <span key={s} className="tag">{s}</span>)}
                    <span className="tag">{r.max} au plus</span>
                  </div>
                </div>
              );
            })}
          </div>
          <h2 style={{ marginTop: 32 }}>Agents d’aide</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>Appelés seulement pour la mise en place ou quand un agent a besoin d’une information extérieure.</p>
          <div className="roles">
            {roles.filter((r) => r.kind === 'aide').map((r) => {
              const Icon = ROLE_ICON[r.id] ?? Bug;
              return (
                <div key={r.id} className="role role--aide">
                  <div className="role__head"><span className="role__icon"><Icon size={16} /></span><span className="role__name">{r.name}</span>{r.web && <span className="tag" style={{ marginLeft: 'auto' }}><Globe size={11} />Internet, lecture seule</span>}</div>
                  <div className="role__mission">{r.mission}</div>
                  <div className="role__meta"><span className="tag">{toolShort(r.tool)} {r.model}</span>{r.skills.map((s) => <span key={s} className="tag">{s}</span>)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'mise' && (
        <>
          <p className="muted small" style={{ marginBottom: 12 }}>Faite une fois au démarrage du projet, en {fmtTokens(setupTokens)} tokens. Tout ce qui est mécanique est fait par le programme.</p>
          <div className="box box--flush">
            <ul className="setup">
              {setupSteps.map((s) => (
                <li key={s.id} className={`is-${s.status}`}>
                  <span className="setup__mark">{s.status === 'fait' ? <CircleCheck size={14} /> : '!'}</span>
                  <div>
                    <div className="setup__title">{s.title}</div>
                    <div className="setup__res">{s.result}</div>
                    {s.sources && <div className="sources">{s.sources.map((x) => <span key={x.url} className="source"><Globe size={12} />{x.label}<span className="faint">{x.url}</span></span>)}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="small">{s.who}</div>
                    <div className="xsmall faint num">{s.tokens ? `${fmtTokens(s.tokens)} tokens` : '0 token'}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {tab === 'agents' && (
        <>
          <div className="box box--flush">
            <table className="table">
              <thead><tr><th>Agent</th><th>Rôle</th><th>Ticket</th><th>Outil et modèle</th><th>État</th><th>Dernière action</th><th className="num">Tokens</th></tr></thead>
              <tbody>
                {team.map((a) => (
                  <tr key={a.id} className="clickable" tabIndex={0} onClick={() => go({ kind: 'ticket', ticketId: a.ticketId })} onKeyDown={(e) => { if (e.key === 'Enter') go({ kind: 'ticket', ticketId: a.ticketId }); }}>
                    <td className="cell-strong">{a.name}</td>
                    <td>{roles.find((r) => r.id === agentRoles[a.id])?.name}</td>
                    <td>{a.ticketId}</td>
                    <td>{toolShort(a.tool)} {a.model}</td>
                    <td><StatePill state={a.state} /></td>
                    <td className="muted">{a.lastAction}</td>
                    <td className="num">{fmtTokens(a.tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 style={{ marginTop: 32 }}>Qui intervient</h2>
          <div className="box box--flush">
            <ol className="journal">
              {interventions.map((iv, i) => {
                const Icon = IV_ICON[iv.kind];
                return (
                  <li key={i} className={`ev ${iv.kind === 'bascule' || iv.kind === 'regle' ? 'ev--regle' : ''}`}>
                    <span className="ev__time">{iv.at}</span>
                    <span className="ev__icon" aria-hidden="true"><Icon size={15} /></span>
                    <div><span className="strong">{iv.who}</span> <span className="muted">{iv.text}</span></div>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

