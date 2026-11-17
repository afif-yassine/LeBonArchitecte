// Déroulé d'un ticket : le plan (étapes et preuves) puis le direct de l'agent.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BookOpen, Bot, Brain, Bug, Check, CheckCircle2, FilePen, FlaskConical, Info, ListChecks, MessageSquare, Terminal,
} from 'lucide-react';
import { roles } from '../mock/data';
import { TICKET_PHASES, ticketPhase, type LiveItem, type LiveKind, type Ticket } from '../shared/contract';
import { Tabs } from './ui';

const roleName = (id?: string) => roles.find((r) => r.id === id)?.name ?? id ?? '';

const ICON: Record<LiveKind, typeof Info> = {
  reflexion: Brain, message: MessageSquare, action: FilePen, commande: Terminal, test: FlaskConical, bug: Bug,
  resolu: CheckCircle2, agent: Bot, skill: BookOpen, etape: ListChecks, systeme: Info,
};
const KIND: Record<LiveKind, string> = {
  reflexion: 'Réflexion', message: 'Message', action: 'Action', commande: 'Commande', test: 'Test', bug: 'Bug',
  resolu: 'Résolu', agent: 'Agent', skill: 'Skill', etape: 'Étape', systeme: 'Programme',
};

type Filter = 'tout' | 'reflexion' | 'actions' | 'bugs' | 'tests';
const IN: Record<Exclude<Filter, 'tout'>, LiveKind[]> = {
  reflexion: ['reflexion'],
  actions: ['action', 'commande', 'agent', 'skill', 'etape', 'message', 'systeme'],
  bugs: ['bug', 'resolu'],
  tests: ['test'],
};

const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function PhaseFrise({ t }: { t: Ticket }) {
  const idx = TICKET_PHASES.findIndex((p) => p.id === ticketPhase(t));
  const blocked = t.status === 'action';
  return (
    <ol className="frise frise--sm" aria-label={`Vie du ticket. Étape actuelle : ${TICKET_PHASES[idx].label}${blocked ? ', bloqué' : ''}`}>
      {TICKET_PHASES.map((p, i) => {
        const state = i < idx || (i === idx && p.id === 'fini') ? 'fait' : i === idx ? 'actuel' : 'futur';
        return (
          <li key={p.id} style={{ display: 'contents' }}>
            {i > 0 && <span className={`frise__line ${i <= idx ? 'is-done' : ''}`} aria-hidden="true" />}
            <span className={`frise__step is-${state} ${i === idx && blocked ? 'is-blocked' : ''}`} aria-current={i === idx ? 'step' : undefined}>
              <span className="frise__num">{state === 'fait' ? <Check size={11} strokeWidth={3} /> : i === idx && blocked ? '!' : i + 1}</span>
              <span className="frise__label">{p.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function StepList({ t, compact }: { t: Ticket; compact?: boolean }) {
  return (
    <ol className={`dsteps ${compact ? 'dsteps--compact' : ''}`}>
      {t.steps.map((s, i) => (
        <li key={s.id} className={`dstep is-${s.state}`}>
          <span className="dstep__mark" aria-hidden="true">
            {s.state === 'prouve' ? <Check size={12} strokeWidth={3.2} /> : s.state === 'annonce' ? <AlertTriangle size={12} /> : s.state === 'en-cours' ? <span className="live" /> : i + 1}
          </span>
          <div className="dstep__body">
            <div className="dstep__label">
              {s.label}
              <span className="sr-only">, {s.state === 'prouve' ? 'prouvé' : s.state === 'annonce' ? 'annoncé, pas prouvé' : s.state === 'en-cours' ? 'en cours' : 'à faire'}</span>
            </div>
            <div className="dstep__meta">
              <span>{roleName(s.role)}</span>
              {s.helper && <span>avec l’agent d’aide {roleName(s.helper)}</span>}
              {s.skills.map((k) => <span key={k} className="tag">{k}</span>)}
            </div>
            {!compact && (
              <div className="dstep__proof">
                {s.state === 'prouve' ? <><b>Prouvé :</b> {s.evidence}</>
                  : s.state === 'annonce' ? <><b>Annoncé, pas prouvé :</b> {s.evidence}</>
                    : <>Preuve attendue : {s.proof.text}</>}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Deroule({ t, feed, demo, onValidatePlan, onSimulate }: {
  t: Ticket; feed: LiveItem[]; demo: boolean; onValidatePlan: () => void; onSimulate: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('tout');
  const listRef = useRef<HTMLOListElement>(null);
  const proven = t.steps.filter((s) => s.state === 'prouve').length;
  const announced = t.steps.filter((s) => s.state === 'annonce').length;
  const running = t.status === 'en-cours';
  const shown = useMemo(() => (filter === 'tout' ? feed : feed.filter((x) => IN[filter].includes(x.kind))), [feed, filter]);
  const count = (f: Exclude<Filter, 'tout'>) => feed.filter((x) => IN[f].includes(x.kind)).length;
  const label = (f: Exclude<Filter, 'tout'>, name: string) => (count(f) ? `${name} ${count(f)}` : name);

  // Le direct suit le travail : on descend en bas, sauf si vous êtes remonté lire.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTo({ top: el.scrollHeight });
  }, [shown.length]);

  return (
    <div className="dr">
      {!t.planOk && (
        <div className="dr__note">
          <ListChecks size={18} aria-hidden="true" />
          <div>
            <strong>Plan proposé, pas encore validé.</strong>
            <p className="small muted">Écrit par règles à partir de la description et des critères, sans token. Le pilote ne lance jamais un plan que vous n’avez pas validé.</p>
          </div>
          <button className="btn btn--primary btn--sm" onClick={onValidatePlan}>Valider le plan</button>
        </div>
      )}

      <section aria-labelledby="dr-steps">
        <div className="dr__head">
          <h3 id="dr-steps">Étapes</h3>
          <span className="muted small num">{proven} sur {t.steps.length} prouvées{announced > 0 && <span style={{ color: 'var(--wait)' }}>, {announced} annoncée{announced > 1 ? 's' : ''} sans preuve</span>}</span>
        </div>
        <StepList t={t} />
        <p className="xsmall faint" style={{ marginTop: 8 }}>Une étape n’est cochée que lorsque le programme a vérifié sa preuve. L’annonce de l’agent ne suffit pas.</p>
      </section>

      <section aria-labelledby="dr-live">
        <div className="dr__head">
          <h3 id="dr-live">En direct {running && <span className="live" aria-label="agent au travail" />}</h3>
          <Tabs<Filter> label="Filtrer le direct" value={filter} onChange={setFilter} tabs={[
            { id: 'tout', label: 'Tout' }, { id: 'reflexion', label: label('reflexion', 'Réflexion') }, { id: 'actions', label: label('actions', 'Actions') },
            { id: 'bugs', label: label('bugs', 'Bugs') }, { id: 'tests', label: label('tests', 'Tests') },
          ]} />
        </div>
        {feed.length === 0 ? (
          <div className="empty empty--left">
            {t.status === 'a-faire' && <p>Le direct commence au lancement : vous verrez l’agent réfléchir, agir, trouver et corriger les bugs, et lancer les tests.</p>}
            {running && demo && (<><p>Aucun agent n’est branché sur ce projet d’exemple. Jouez un déroulé pour voir à quoi ressemble le travail.</p><button className="btn btn--sm" onClick={onSimulate}>Simuler un déroulé</button></>)}
            {running && !demo && <p>Aucun agent n’est encore branché sur ce PC. L’adaptateur Claude (LBA-6) fera travailler un vrai agent ici.</p>}
            {(t.status === 'termine' || t.status === 'a-tester') && <p>Ce ticket a été fait avant le journal détaillé : seul le résultat est gardé, dans « Réalisé ».</p>}
          </div>
        ) : shown.length === 0 ? <p className="muted small">Rien dans ce filtre pour l’instant.</p> : (
          <ol className="feed" ref={listRef} aria-live="polite">
            {shown.map((it) => {
              const Icon = ICON[it.kind] ?? Info;
              return (
                <li key={it.id} className={`fd fd--${it.kind} ${it.ok === false ? 'is-ko' : it.ok ? 'is-ok' : ''}`}>
                  <span className="fd__time">{time(it.at)}</span>
                  <span className="fd__icon" aria-hidden="true"><Icon size={15} /></span>
                  <div className="fd__body">
                    <div className="fd__text">{it.kind === 'reflexion' ? <q>{it.text}</q> : it.text}</div>
                    {it.detail && <div className="fd__detail">{it.detail}</div>}
                  </div>
                  <span className="fd__kind">{it.who === 'vous' ? 'Vous' : KIND[it.kind]}</span>
                </li>
              );
            })}
          </ol>
        )}
        {feed.some((x) => x.kind === 'reflexion') && <p className="xsmall faint" style={{ marginTop: 8 }}>La réflexion est celle que Claude ou Codex rendent, souvent résumée. Afficher le direct ne coûte aucun token.</p>}
      </section>
    </div>
  );
}
