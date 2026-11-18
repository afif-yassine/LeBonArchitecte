import { useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Clock, FileClock, FileCheck2, Hand, KeyRound, ListChecks, Pause, Play, Plus, RotateCcw, ShieldAlert, Square } from 'lucide-react';
import { agents, projects } from '../mock/data';
import { COLUMNS, budgetFor, type Ticket } from '../shared/contract';
import { Bar, Switch, fmtTokens, toolShort } from '../components/ui';
import { LaunchDialog } from '../components/LaunchDialog';
import { useNotify } from '../components/notify';
import { useStore } from '../store';
import type { Go } from '../view';
import '../plans.css';

// « Valider les plans et lancer » : vous cochez, les plans sont validés d'un coup, le pilote lance
// autant d'agents que de places (chacun sur sa branche) ; ceux qui attendent un autre ticket attendent seuls.
function PlansPanel({ projectId, todo, onClose }: { projectId: string; todo: Ticket[]; onClose: () => void }) {
  const notify = useNotify();
  const { tickets, autopilot, setAutopilot } = useStore();
  const [pick, setPick] = useState<Set<string>>(() => new Set(todo.map((t) => t.id)));
  const [busy, setBusy] = useState(false);
  const waits = (t: Ticket) => t.deps.filter((d) => tickets.find((x) => x.id === d)?.status !== 'termine');
  const flip = (id: string) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/plans/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...pick] }) });
      notify(((await r.json()) as { message?: string }).message ?? 'Fait.');
      if (r.ok) onClose();
    } finally { setBusy(false); }
  };
  return (
    <section className="plans" aria-label="Valider les plans et lancer">
      <div className="plans__head">
        <h3>Valider les plans et lancer</h3>
        <p className="muted small">Chaque ticket coché part sur sa propre branche, sans toucher à main. Rien n’est réuni avant votre « Valider ».</p>
      </div>
      <ul className="plans__list">
        {todo.map((t) => {
          const w = waits(t);
          // Il attend un ticket dont le plan n'est pas validé et que vous n'avez pas coché : il ne partira pas.
          const blockedForever = w.some((d) => { const x = tickets.find((y) => y.id === d); return !pick.has(d) && x?.status === 'a-faire' && !x.planOk; });
          return (
            <li key={t.id}>
              <label className="plans__row">
                <input type="checkbox" checked={pick.has(t.id)} onChange={() => flip(t.id)} />
                <b>{t.id}</b><span className="plans__title">{t.title}</span>
                <span className="faint xsmall">{t.steps.length} étapes</span>
                {w.length > 0 && <span className={`pill ${blockedForever && pick.has(t.id) ? 'pill--danger' : 'pill--wait'}`}>{blockedForever && pick.has(t.id) ? `bloqué : ${w.join(', ')} pas coché` : `attend ${w.join(', ')}`}</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="plans__foot">
        <label className="small">Agents en même temps{' '}
          <select value={autopilot.maxParallel} onChange={(e) => setAutopilot({ maxParallel: Number(e.target.value) })} aria-label="Agents en même temps">
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {!autopilot.on && <span className="pill pill--wait">Pilote coupé : les plans seront validés sans lancement</span>}
        <span className="grow" />
        <button className="btn btn--ghost btn--sm" onClick={onClose}>Fermer</button>
        <button className="btn btn--primary btn--sm" disabled={busy || pick.size === 0} onClick={go}><Play size={13} /> Valider {pick.size} plan{pick.size > 1 ? 's' : ''} et lancer</button>
      </div>
    </section>
  );
}

function Card({ t, go, onLaunch }: { t: Ticket; go: Go; onLaunch: (id: string) => void }) {
  const { simulate, isReady, validate, test, pause, resume } = useStore();
  // Valider (tests, réunion, tests dans main) et Tester durent : le bouton dit ce qui se passe.
  const [busy, setBusy] = useState<'valider' | 'tester' | null>(null);
  const doing = (what: 'valider' | 'tester') => { setBusy(what); (what === 'valider' ? validate : test)(t.id).finally(() => setBusy(null)); };
  const agent = agents.find((a) => a.id === t.agentId);
  const open = () => go({ kind: 'ticket', ticketId: t.id });
  const realized = t.status === 'termine' || t.status === 'a-tester';
  const reported = realized && (t.reportedIn
    ? <span className="reported" title={`Déjà dans le compte rendu ${t.reportedIn}`}><FileCheck2 size={12} />{t.reportedIn}</span>
    : <span className="reported is-new" title="Pas encore dans un compte rendu"><FileClock size={12} />à rapporter</span>);

  if (t.status === 'termine') {
    return (
      <div className="card is-done">
        <button className="card__main" onClick={open}>
          <span className="card__top"><span className="card__id">{t.id}</span><CheckCircle2 size={13} style={{ color: 'var(--ok)' }} aria-label="fini" /><span style={{ marginLeft: 'auto' }}>{reported}</span></span>
          <span className="card__title">{t.title}</span>
        </button>
      </div>
    );
  }

  const okCount = t.criteria.filter((c) => c.done).length;
  const ready = isReady(t);
  const proven = t.steps.filter((s) => s.state === 'prouve').length;
  const current = t.steps.find((s) => s.state !== 'prouve');
  const demo = projects.find((p) => p.id === t.projectId)?.demo;
  return (
    <div className={`card ${t.securityBlock ? 'is-sec' : ''} ${t.status === 'en-cours' ? 'is-run' : ''}`}>
      <button className="card__main" onClick={open}>
        <span className="card__top">
          <span className="card__id">{t.id}</span>
          <span className="tag card__tool">{toolShort(t.tool)} {t.model}</span>
        </span>
        <span className="card__title">{t.title}</span>
        {t.securityBlock && <span className="flag flag--sec"><ShieldAlert size={14} aria-hidden="true" />Bloqué par sécurité</span>}
        {t.needAction && <span className="flag flag--wait"><KeyRound size={14} aria-hidden="true" />{t.needAction}</span>}
        {t.activity?.steps.some((s) => s.state === 'en-cours') && <span className="flag flag--accent"><Clock size={14} aria-hidden="true" />{t.activity.label} : {t.activity.steps.find((s) => s.state === 'en-cours')?.label}…</span>}
        {t.status === 'a-tester' && t.activity?.error && <span className="flag flag--danger"><ShieldAlert size={14} aria-hidden="true" />{t.activity.error}</span>}
        {t.status === 'a-faire' && !ready && <span className="flag"><Pause size={14} aria-hidden="true" />Attend {t.deps.join(', ')}</span>}
        {t.status === 'a-faire' && t.paused && <span className="flag flag--wait"><Pause size={13} aria-hidden="true" />En pause</span>}
        {t.status === 'a-faire' && !t.paused && t.waitingFor?.startsWith('Reprend') && <span className="flag flag--accent"><Clock size={13} aria-hidden="true" />{t.waitingFor}</span>}
        {t.status === 'a-faire' && !t.planOk && <span className="flag"><ListChecks size={14} aria-hidden="true" />Plan à valider</span>}
        {t.status === 'en-cours' && current && <span className="flag"><ListChecks size={14} aria-hidden="true" />Étape {proven + 1} sur {t.steps.length} : {current.label}</span>}
        {t.status === 'a-tester' && <span className="flag flag--ok"><CheckCircle2 size={14} aria-hidden="true" />{okCount}/{t.criteria.length} critères, tests verts</span>}
        {agent && t.status === 'en-cours' && <span className={`flag ${agent.lastAction.includes('sans retour') ? 'flag--danger' : 'flag--accent'}`}>{agent.state === 'attend' ? <Hand size={14} /> : <Clock size={14} />}{agent.lastAction}</span>}
        {(t.used > 0 || realized) && (
          <span className="card__foot">
            {t.used > 0 && <span style={{ flex: 1 }}><Bar value={t.used} max={budgetFor(t)} label={`Budget de ${t.id}`} /></span>}
            {t.used > 0 && <span className="num">{fmtTokens(t.used)}</span>}
            {realized && <span style={{ marginLeft: 'auto' }}>{reported}</span>}
          </span>
        )}
      </button>
      {t.status === 'a-faire' && (
        <div className="card__acts">
          {t.paused
            ? <button className="btn btn--sm" onClick={() => resume(t.id)}><Play size={12} />Reprendre</button>
            : <>
                <button className="btn btn--sm" onClick={() => onLaunch(t.id)}><Play size={12} />Lancer</button>
                <button className="btn btn--sm btn--ghost" onClick={() => pause(t.id)} title="Le pilote ne le lancera pas avant « Reprendre »"><Pause size={12} />Pause</button>
              </>}
        </div>
      )}
      {t.status === 'action' && t.interrupted && (
        <div className="card__acts"><button className="btn btn--sm" onClick={() => resume(t.id)}><RotateCcw size={12} />Reprendre</button></div>
      )}
      {t.status === 'a-tester' && (
        <div className="card__acts">
          <button className="btn btn--sm" disabled={busy !== null} onClick={() => doing('valider')} title="Tests dans sa branche, réunion dans main, puis tests dans main">
            <Check size={12} />{busy === 'valider' ? 'Validation… tests puis réunion' : 'Valider'}
          </button>
          <button className="btn btn--sm btn--ghost" disabled={busy !== null} onClick={() => doing('tester')} title="Lance les tests du projet dans la branche de ce ticket">
            {busy === 'tester' ? 'Tests en cours…' : 'Tester'}
          </button>
        </div>
      )}
      {t.status === 'en-cours' && (
        <div className="card__acts">
          <button className="btn btn--sm" onClick={() => pause(t.id)} title="Arrête l’agent ; son travail et sa conversation sont gardés"><Pause size={11} />Pause</button>
          {demo && <button className="btn btn--sm btn--ghost" onClick={() => simulate(t.id)} title="Démonstration : jouer un déroulé complet de ce ticket">Simuler</button>}
        </div>
      )}
    </div>
  );
}

export function ProjectBoard({ projectId, go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const { tickets, autopilot, setAutopilot, queue, running, isReady } = useStore();
  const [launching, setLaunching] = useState<string | null>(null);
  const [plans, setPlans] = useState(false);
  const p = projects.find((x) => x.id === projectId)!;
  const ts = tickets.filter((t) => t.projectId === projectId);
  const unplanned = ts.filter((t) => t.status === 'a-faire' && !t.planOk).sort((a, b) => a.priority - b.priority);
  const lot = ts.filter((t) => t.lot === p.lot.n);
  const lotDone = lot.filter((t) => t.status === 'termine' || t.status === 'a-tester').length;
  const q = queue(projectId);
  const run = running(projectId);

  return (
    <>
      <div className="work-top">
        <div className={`pilot ${autopilot.on ? 'is-on' : ''}`}>
          <div className="pilot__state">
            <Switch checked={autopilot.on} label="Pilote automatique" onChange={(v) => setAutopilot({ on: v })} />
            <div>
              <div className="pilot__title">Pilote automatique</div>
              <div className="pilot__sub">{autopilot.on && autopilot.budgetHit
                ? `Arrêté : budget du jour atteint (${fmtTokens(autopilot.spentToday)} sur ${fmtTokens(autopilot.dayBudget)}). Aucun nouveau ticket ne part.`
                : autopilot.on
                ? `${run.length} sur ${autopilot.maxParallel} en cours.${unplanned.length ? ` ${unplanned.length} plan${unplanned.length > 1 ? 's' : ''} à valider : le pilote ne lance que les plans validés.` : ' Un ticket fini lance le suivant prêt.'}`
                : 'Coupé : vous lancez les tickets vous-même.'}</div>
            </div>
          </div>
          <div className="queue" aria-label="File d’attente du pilote">
            {run.map((t) => <span key={t.id} className="qchip is-run"><b>{t.id}</b>en cours</span>)}
            {q.length > 0 && <span className="qarrow" aria-hidden="true"><ArrowRight size={14} /></span>}
            {q.slice(0, 5).map((t, i) => (
              <span key={t.id} style={{ display: 'contents' }}>
                {i > 0 && <span className="qarrow" aria-hidden="true"><ArrowRight size={13} /></span>}
                <span className={`qchip ${isReady(t) ? '' : 'is-blocked'}`} title={isReady(t) ? 'Prêt' : `Attend ${t.deps.join(', ')}`}><b>{t.id}</b>{t.title.length > 22 ? `${t.title.slice(0, 22)}…` : t.title}</span>
              </span>
            ))}
            {q.length === 0 && <span className="queue__label">File vide</span>}
          </div>
          {unplanned.length > 0 && !plans && <button className="btn btn--sm btn--primary" onClick={() => setPlans(true)}><Play size={13} /> Valider les plans et lancer</button>}
          <button className="btn btn--sm btn--ghost" onClick={() => go({ kind: 'projet', projectId, space: 'parametres' })}>Règles</button>
        </div>
        {plans && unplanned.length > 0 && <PlansPanel projectId={projectId} todo={unplanned} onClose={() => setPlans(false)} />}

        <div className="lotline">
          <span>Lot {p.lot.n} <strong>« {p.lot.name} »</strong></span>
          <span><strong className="num">{lotDone}/{lot.length}</strong> tickets réalisés</span>
          <span><strong className="num">{fmtTokens(p.tokensToday)}</strong> tokens aujourd’hui</span>
          <span className="gate"><strong>Porte</strong> {p.gate}<button className="btn btn--sm" onClick={() => notify('Maquette : valider la porte fait passer le projet à l’étape suivante.')}>Valider</button></span>
        </div>
      </div>

      <div className="board">
        {COLUMNS.map((c) => {
          const list = ts.filter((t) => t.status === c.id).sort((a, b) => a.priority - b.priority);
          return (
            <section key={c.id} className={`col ${c.id === 'action' ? 'col--action' : ''}`} aria-label={`${c.label}, ${list.length} tickets`}>
              <div className="col__head">
                {c.id === 'action' && <Hand size={14} aria-hidden="true" />}
                <span>{c.id === 'action' ? 'Besoin d’action' : c.label}</span>
                <span className="col__count">{list.length}</span>
              </div>
              <ul className="col__list">
                {list.length === 0 && <li className="col__empty">{c.id === 'action' ? 'Rien ne vous attend.' : 'Aucun ticket.'}</li>}
                {list.map((t) => <li key={t.id}><Card t={t} go={go} onLaunch={setLaunching} /></li>)}
              </ul>
              {c.id === 'a-faire' && (
                <button className="btn btn--ghost btn--sm col__add" onClick={() => notify('Avant de créer un ticket, le programme cherche les doublons dans les tickets, l’historique git et le code.')}><Plus size={14} />Ticket</button>
              )}
            </section>
          );
        })}
      </div>
      {launching && <LaunchDialog ticketId={launching} onClose={() => setLaunching(null)} />}
    </>
  );
}
