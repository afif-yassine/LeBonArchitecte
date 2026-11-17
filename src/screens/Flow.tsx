import { useState } from 'react';
import { ArrowRight, Check, DoorOpen, FileText } from 'lucide-react';
import { flow, projects } from '../mock/data';
import { ESN_STEPS } from '../shared/contract';
import { fmtTokens } from '../components/ui';
import { useStore } from '../store';
import type { Go } from '../view';

const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const hue = (s: string) => [...s].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;

// Le flux complet du projet : une chaîne de 6 étapes. On clique une étape pour voir qui agit et ce qui en sort.
export function Flow({ projectId, go }: { projectId: string; go: Go }) {
  const p = projects.find((x) => x.id === projectId)!;
  const { tickets, running, queue, autopilot } = useStore();
  const idx = ESN_STEPS.findIndex((s) => s.id === p.step);
  const [open, setOpen] = useState(idx);
  const run = running(projectId);
  const next = queue(projectId)[0];
  const ts = tickets.filter((t) => t.projectId === projectId);
  const lot = ts.filter((t) => t.lot === p.lot.n);
  const lotDone = lot.filter((t) => t.status === 'termine' || t.status === 'a-tester').length;
  const f = flow[open];
  const step = ESN_STEPS[open];
  const state = open < idx ? 'fait' : open === idx ? 'actuel' : 'futur';

  return (
    <div className="page page--flow">
      <div className="flowhead">
        <div>
          <h1>Flux de travail</h1>
          <p className="lead">De l’idée au déploiement. L’orchestrateur enchaîne les étapes par règles et ne vous arrête qu’aux portes.</p>
        </div>
        <div className="kpis kpis--inline">
          <div className="kpi"><div className="kpi__v">{run.map((t) => t.id).join(', ') || '—'}</div><div className="kpi__l">en cours</div></div>
          <div className="kpi"><div className="kpi__v">{next?.id ?? '—'}</div><div className="kpi__l">{autopilot.on ? 'ensuite, lancé seul' : 'ensuite, par vous'}</div></div>
          <div className="kpi"><div className="kpi__v num">{fmtTokens(flow.reduce((s, x) => s + x.tokens, 0))}</div><div className="kpi__l">tokens depuis le début</div></div>
        </div>
      </div>

      <ol className="pipeline" aria-label="Étapes du projet">
        {ESN_STEPS.map((s, i) => {
          const st = i < idx ? 'fait' : i === idx ? 'actuel' : 'futur';
          const progress = st === 'fait' ? 100 : st === 'actuel' ? Math.round((lotDone / Math.max(lot.length, 1)) * 100) : 0;
          return (
            <li key={s.id}>
              <button className={`pstage is-${st}`} aria-pressed={open === i} onClick={() => setOpen(i)}>
                <span className="pstage__top">
                  <span className="pstage__num">{st === 'fait' ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                  <span className="pstage__state">{st === 'fait' ? 'validée' : st === 'actuel' ? `${lotDone} sur ${lot.length}` : 'à venir'}</span>
                </span>
                <span className="pstage__name">{s.label}</span>
                <span className="pstage__bar"><span style={{ width: `${progress}%` }} /></span>
              </button>
              {i < ESN_STEPS.length - 1 && <span className={`pipeline__link ${i < idx ? 'is-done' : ''}`} aria-hidden="true"><ArrowRight size={14} /></span>}
            </li>
          );
        })}
      </ol>

      <section className={`sdetail is-${state}`} aria-live="polite">
        <div className="sdetail__head">
          <div>
            <div className="sdetail__kicker">Étape {open + 1} sur 6{state === 'actuel' ? ', en cours' : state === 'fait' ? ', validée' : ', à venir'}</div>
            <h2 className="sdetail__title">{step.label}</h2>
            <p className="muted">{step.question}</p>
          </div>
          {f.tokens > 0 && <div className="sdetail__tok"><b className="num">{fmtTokens(f.tokens)}</b><span>tokens</span></div>}
        </div>

        <div className="sdetail__grid">
          <div>
            <div className="sdetail__label">Ce qui se passe</div>
            <ol className="mini-tl">
              {f.activities.map((a) => (
                <li key={a.text} className={`is-${a.status}`}>
                  <span className="mini-tl__dot" />
                  <div><div className="strong" style={{ fontWeight: 550 }}>{a.text}</div><div className="xsmall faint">{a.who}</div></div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <div className="sdetail__label">Qui agit</div>
            <div className="people">
              {f.roles.map((r) => (
                <span key={r} className="person">
                  <span className="person__av" style={{ background: `oklch(.7 .08 ${hue(r)} / .22)`, color: `oklch(.78 .1 ${hue(r)})` }}>{initials(r)}</span>
                  {r}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="sdetail__label">Ce qui en sort</div>
            <div className="deliv">{f.produces.map((x) => <span key={x} className="deliv__item"><FileText size={14} />{x}</span>)}</div>
          </div>
        </div>

        <div className="sdetail__gate">
          <span className="sdetail__door"><DoorOpen size={16} /></span>
          <div style={{ flex: 1 }}><div className="xsmall faint">Porte de validation</div><div className="strong" style={{ fontWeight: 550 }}>{f.gate}</div></div>
          {state === 'actuel' && <button className="btn btn--primary btn--sm" onClick={() => go({ kind: 'projet', projectId, space: 'travail' })}>Voir le travail</button>}
          {state === 'fait' && <span className="pill pill--ok">validée</span>}
          {state === 'futur' && <span className="pill">pas encore</span>}
        </div>
      </section>
    </div>
  );
}
