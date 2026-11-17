import { useState } from 'react';
import { CircleCheck, Download, Hand, KeyRound, ShieldAlert } from 'lucide-react';
import { proposals as initialProposals } from '../mock/data';
import { CopyCommand } from '../components/ui';
import { useNotify } from '../components/notify';
import { useStore } from '../store';
import type { Go } from '../view';

const ICON = { question: Hand, securite: ShieldAlert, cle: KeyRound, installation: Download, reunion: CircleCheck };
const TONE = { question: 'accent', securite: 'sec', cle: 'wait', installation: 'wait', reunion: 'ok' };

// « Pour vous » : seulement les actions de CE projet. Rien d'un autre projet ne s'affiche ici.
export function Actions({ projectId, go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const { actions, resolveAction, validate } = useStore();
  const [props, setProps] = useState(initialProposals.filter((p) => p.projectId === projectId));
  const sorted = [...actions(projectId)].sort((a, b) => Number(b.blocking) - Number(a.blocking));

  return (
    <div className="page">
      <h1>Pour vous</h1>
      <p className="lead">Ce que ce projet attend de vous, le plus urgent en premier. Le programme ne vous arrête que pour de vraies décisions.</p>

      <section className="section" style={{ marginTop: 26 }}>
        {sorted.length === 0 ? (
          <div className="empty"><h3>Rien ne vous attend</h3><p>L’équipe avance seule. Vous serez prévenu dès qu’une décision vous revient.</p></div>
        ) : sorted.map((a) => {
          const Icon = ICON[a.kind];
          return (
            <article key={a.id} className={`act act--${a.kind === 'securite' ? 'sec' : a.kind}`}>
              <div className="act__head">
                <Icon size={17} style={{ color: `var(--${TONE[a.kind]})` }} aria-hidden="true" />
                <span className="act__title">{a.kind === 'securite' ? 'Bloqué par sécurité' : a.title}</span>
                <span className="act__meta">
                  {a.ticketId && <button className="link" onClick={() => go({ kind: 'ticket', ticketId: a.ticketId! })}>{a.ticketId}</button>}
                  {a.blocking ? <span className="pill pill--wait">bloquant</span> : <span className="pill">non bloquant</span>}
                  <span>depuis {a.since}</span>
                </span>
              </div>
              <dl className="facts">
                <dt>Cause</dt><dd>{a.cause}</dd>
                {a.proof && <><dt>Preuve</dt><dd><span className="proof">{a.proof}</span></dd></>}
                {a.rule && <><dt>Règle</dt><dd>{a.rule}</dd></>}
                <dt>À faire</dt><dd>{a.todo}</dd>
              </dl>
              {a.command && <CopyCommand command={a.command} />}
              <div className="row">
                {a.buttons.map((b, i) => (
                  <button key={b} className={`btn ${i === 0 ? 'btn--primary' : ''}`} onClick={() => {
                    if (b.startsWith('Voir') && a.ticketId) go({ kind: 'ticket', ticketId: a.ticketId });
                    else if (b === 'Reporter') notify('Reporté. Je vous le rappellerai demain matin.');
                    else if (b.startsWith('Ouvrir')) notify('Maquette : l’aperçu s’ouvre dans un onglet (J5).');
                    else if (b.startsWith('Valider') && a.ticketId) validate(a.ticketId);
                    else resolveAction(a.id, b);
                  }}>{b}</button>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <section className="section" aria-labelledby="h-props">
        <h2 id="h-props">Propositions des agents</h2>
        <p className="muted small" style={{ marginBottom: 6 }}>Recommandations faites pendant le travail. Jamais exécutées sans votre accord.</p>
        {props.length === 0 ? <p className="faint">Aucune proposition en attente.</p> : props.map((pr) => (
          <div key={pr.id} className="proposal">
            <div>
              <div className="strong" style={{ fontWeight: 550 }}>{pr.text}</div>
              <div className="small muted">{pr.why} Proposé par {pr.from}.</div>
            </div>
            <div className="row" style={{ flex: 'none' }}>
              <button className="btn btn--sm" onClick={() => { setProps((l) => l.filter((x) => x.id !== pr.id)); notify('Ajouté au backlog.'); }}>Ajouter au backlog</button>
              <button className="btn btn--ghost btn--sm" onClick={() => { setProps((l) => l.filter((x) => x.id !== pr.id)); notify('Proposition écartée.'); }}>Écarter</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
