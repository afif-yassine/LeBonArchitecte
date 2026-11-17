import { useState } from 'react';
import { ArrowRight, Check, CheckCircle2, Clock, FileClock, FileCheck2, Hand, KeyRound, Pause, Play, Plus, ShieldAlert, Square } from 'lucide-react';
import { agents, projects } from '../mock/data';
import { COLUMNS, type Ticket } from '../shared/contract';
import { Bar, Switch, fmtTokens, toolShort } from '../components/ui';
import { LaunchDialog } from '../components/LaunchDialog';
import { useNotify } from '../components/notify';
import { useStore } from '../store';
import type { Go } from '../view';

function Card({ t, go, onLaunch }: { t: Ticket; go: Go; onLaunch: (id: string) => void }) {
  const { stop, finish, isReady, validate } = useStore();
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
        {t.status === 'a-faire' && !ready && <span className="flag"><Pause size={14} aria-hidden="true" />Attend {t.deps.join(', ')}</span>}
        {t.status === 'a-faire' && t.waitingFor?.startsWith('Arrêté') && <span className="flag flag--wait"><Square size={13} aria-hidden="true" />Arrêté par vous</span>}
        {t.status === 'a-tester' && <span className="flag flag--ok"><CheckCircle2 size={14} aria-hidden="true" />{okCount}/{t.criteria.length} critères, tests verts</span>}
        {agent && t.status === 'en-cours' && <span className={`flag ${agent.lastAction.includes('sans retour') ? 'flag--danger' : 'flag--accent'}`}>{agent.state === 'attend' ? <Hand size={14} /> : <Clock size={14} />}{agent.lastAction}</span>}
        {(t.used > 0 || realized) && (
          <span className="card__foot">
            {t.used > 0 && <span style={{ flex: 1 }}><Bar value={t.used} max={t.budget} label={`Budget de ${t.id}`} /></span>}
            {t.used > 0 && <span className="num">{fmtTokens(t.used)}</span>}
            {realized && <span style={{ marginLeft: 'auto' }}>{reported}</span>}
          </span>
        )}
      </button>
      {t.status === 'a-faire' && (
        <div className="card__acts"><button className="btn btn--sm" onClick={() => onLaunch(t.id)}><Play size={12} />Lancer</button></div>
      )}
      {t.status === 'a-tester' && (
        <div className="card__acts">
          <button className="btn btn--sm" onClick={() => validate(t.id)}><Check size={12} />Valider</button>
          <button className="btn btn--sm btn--ghost" onClick={open}>Tester</button>
        </div>
      )}
      {t.status === 'en-cours' && (
        <div className="card__acts">
          <button className="btn btn--sm" onClick={() => stop(t.id)}><Square size={11} />Arrêter</button>
          <button className="btn btn--sm btn--ghost" onClick={() => finish(t.id)} title="Démonstration : simuler la fin de ce ticket">Simuler la fin</button>
        </div>
      )}
    </div>
  );
}

export function ProjectBoard({ projectId, go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const { tickets, autopilot, setAutopilot, queue, running, isReady } = useStore();
  const [launching, setLaunching] = useState<string | null>(null);
  const p = projects.find((x) => x.id === projectId)!;
  const ts = tickets.filter((t) => t.projectId === projectId);
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
              <div className="pilot__sub">{autopilot.on ? `Un ticket fini lance le suivant prêt. ${run.length} sur ${autopilot.maxParallel} en cours.` : 'Coupé : vous lancez les tickets vous-même.'}</div>
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
          <button className="btn btn--sm btn--ghost" onClick={() => go({ kind: 'projet', projectId, space: 'parametres' })}>Règles</button>
        </div>

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
