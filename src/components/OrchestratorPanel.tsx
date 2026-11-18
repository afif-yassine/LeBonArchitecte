import { ArrowLeftRight, ChevronsRight, CircleAlert, Hand, Lock, MessageSquare, Scale, ShieldAlert } from 'lucide-react';
import { agentRoles, agents, interventions, projects, roles } from '../mock/data';
import { useStore } from '../store';
import { toolShort } from './ui';
import type { Go } from '../view';

const IV_ICON = { verrou: Lock, bascule: ArrowLeftRight, message: MessageSquare, regle: Scale };

// Plus de chat : le panneau dit seulement ce qui compte maintenant.
export function OrchestratorPanel({ onClose, go, projectId }: { onClose: () => void; go: Go; projectId: string }) {
  const { actions, resolveAction, tickets } = useStore();
  const list = actions(projectId);
  const next = list.find((a) => a.blocking) ?? list[0];
  const waits = list.filter((a) => a !== next);
  const team = agents.filter((a) => a.projectId === projectId && tickets.find((t) => t.id === a.ticketId)?.status !== 'a-tester');

  return (
    <aside className="panel" aria-label="Orchestrateur">
      <div className="panel__head">
        <div className="panel__title"><span className="orb" aria-hidden="true" />Orchestrateur<span className="xsmall faint" style={{ fontWeight: 500 }}>par règles, 0 token</span></div>
        <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose} aria-label="Replier le panneau (Ctrl+.)" title="Replier (Ctrl+.)"><ChevronsRight size={17} /></button>
      </div>

      <div className="panel__scroll">
        <section>
          <div className="panel__label">Prochaine action</div>
          {next ? (
            <div className="nextcard">
              <div className="nextcard__text">{next.ticketId && !next.title.startsWith(next.ticketId) ? `${next.ticketId} : ` : ''}{next.title}</div>
              <div className="small muted" style={{ marginBottom: 10 }}>{next.todo}</div>
              <div className="row">
                <button className="btn btn--primary btn--sm" onClick={() => resolveAction(next.id, next.buttons[0])}>{next.buttons[0]}</button>
                <button className="btn btn--ghost btn--sm" onClick={() => go({ kind: 'projet', projectId, space: 'pour-vous' })}>Détails</button>
              </div>
            </div>
          ) : <div className="nextcard"><div className="nextcard__text">Rien ne vous attend.</div><div className="small muted">L’équipe avance seule.</div></div>}
        </section>

        {waits.length > 0 && (
          <section>
            <div className="panel__label">Ensuite, pour vous</div>
            <ul className="waits">
              {waits.map((a) => (
                <li key={a.id}>
                  <button onClick={() => go({ kind: 'projet', projectId, space: 'pour-vous' })}>
                    {a.kind === 'securite' ? <ShieldAlert size={15} style={{ color: 'var(--sec)' }} /> : a.kind === 'question' ? <Hand size={15} style={{ color: 'var(--accent)' }} /> : <CircleAlert size={15} style={{ color: 'var(--wait)' }} />}
                    <span>{a.ticketId && !a.title.startsWith(a.ticketId) ? `${a.ticketId} ` : ''}{a.title.startsWith('T-') ? a.title : a.title.charAt(0).toLowerCase() + a.title.slice(1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="panel__label">Équipe au travail</div>
          {team.length === 0 ? <p className="small faint">Aucun agent en ce moment.</p> : (
            <ul className="team">
              {team.map((a) => (
                <li key={a.id}>
                  <span className={`sdot sdot--${a.state}`} aria-hidden="true" />
                  <div>
                    <button className="link" style={{ color: 'var(--text-strong)', fontWeight: 600 }} onClick={() => go({ kind: 'ticket', ticketId: a.ticketId })}>{a.ticketId} {a.name}</button>
                    <span className="faint xsmall"> {roles.find((r) => r.id === agentRoles[a.id])?.name}, {toolShort(a.tool)} {a.model}</span>
                    <div className="team__what">{a.lastAction}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="panel__label">Ce que j’ai décidé, par règles</div>
          <ol className="journal">
            {!projects.find((p) => p.id === projectId)?.demo && <li className="muted small">Pas encore branché sur ce projet : le journal des décisions du pilote arrive au lot 2.</li>}
            {projects.find((p) => p.id === projectId)?.demo && interventions.map((iv, i) => {
              const Icon = IV_ICON[iv.kind];
              return (
                <li key={i} className={`ev ${iv.kind === 'bascule' || iv.kind === 'regle' ? 'ev--regle' : ''}`} style={{ gridTemplateColumns: '40px 16px minmax(0,1fr)', fontSize: '.86rem' }}>
                  <span className="ev__time">{iv.at}</span>
                  <span className="ev__icon" aria-hidden="true"><Icon size={13} /></span>
                  <span className="muted">{iv.text}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </aside>
  );
}
