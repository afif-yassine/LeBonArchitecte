// Déroulé d'un ticket : le plan (étapes et preuves) puis le direct de l'agent.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BookOpen, Bot, Brain, Bug, Check, CheckCircle2, FilePen, FlaskConical, Info, ListChecks, MessageSquare, Terminal,
} from 'lucide-react';
import { roles } from '../mock/data';
import { TICKET_PHASES, ticketPhase, type LiveItem, type LiveKind, type Ticket } from '../shared/contract';
import { Tabs } from './ui';
import { isTestCommand } from '../shared/tests';
import '../deroule.css';

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

// ---------- Le récit : le direct raconté par tours, avec seulement les moments utiles ----------
// Moments gardés en clair : ce que dit l'agent, vos messages, étapes prouvées, tests, bugs, alertes du programme.
// Le reste (lectures, recherches, commandes) est regroupé en une ligne qu'on ouvre ; « Tout le détail » montre tout.
type Entry = { type: 'moment'; it: LiveItem } | { type: 'work'; items: LiveItem[] };
interface Tour { title: string; model?: string; start?: string; end?: string; entries: Entry[] }

// Un vrai passage de tests (pas une recherche de l'agent qui contient le mot « test »).
export const isTestRun = (it: LiveItem) => (it.kind === 'test' || it.kind === 'commande') && isTestCommand(it.text.trim().replace(/\s:\s(vert|en échec)$/, ''));
const isMoment = (it: LiveItem) =>
  it.kind === 'message' || it.kind === 'reflexion' || isTestRun(it) || it.kind === 'bug' || it.kind === 'resolu'
  || (it.kind === 'etape' && it.ok !== undefined) || (it.kind === 'systeme' && it.ok !== undefined);
const tourStart = (it: LiveItem) =>
  (it.kind === 'agent' && /^Lancé sur/.test(it.text)) ? 'launch'
  : (it.kind === 'message' && it.who === 'vous' && /^Ça ne marche pas/.test(it.text)) ? 'demande'
  : (it.kind === 'systeme' && /^(Réparation automatique|Repris par vous|Reprise de sa session)/.test(it.text)) ? 'reprise' : null;

function toTours(feed: LiveItem[]): Tour[] {
  const tours: Tour[] = [{ title: 'Avant le lancement', entries: [] }];
  let launches = 0;
  for (const it of feed) {
    const k = tourStart(it);
    if (k) {
      if (k === 'launch') launches++;
      const cur = tours[tours.length - 1];
      // Une reprise juste après un lancement reste dans le même tour.
      if (!(k === 'reprise' && cur.entries.length <= 2 && cur.start)) {
        tours.push({ title: k === 'launch' ? (launches === 1 ? 'Premier tour de l’agent' : `Relance ${launches - 1}`) : k === 'demande' ? 'Votre demande de modification' : 'Reprise', entries: [] });
      }
    }
    const tour = tours[tours.length - 1];
    tour.start ??= it.at;
    tour.end = it.at;
    const m = it.kind === 'agent' ? it.text.match(/^Lancé sur (\w+)/) : null;
    if (m) tour.model = m[1];
    if (isMoment(it) || k === 'demande') tour.entries.push({ type: 'moment', it });
    else {
      const last = tour.entries[tour.entries.length - 1];
      if (last?.type === 'work') last.items.push(it); else tour.entries.push({ type: 'work', items: [it] });
    }
  }
  return tours.filter((x) => x.entries.length > 0);
}

const hm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
const minutes = (a?: string, b?: string) => (a && b ? Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

function WorkLine({ items }: { items: LiveItem[] }) {
  const [open, setOpen] = useState(false);
  const reads = items.filter((i) => i.kind === 'action' && i.text.startsWith('Lit ')).length;
  const finds = items.filter((i) => i.kind === 'action' && i.text.startsWith('Cherche ')).length;
  const edits = [...new Set(items.filter((i) => i.kind === 'action' && /^(Modifie|Écrit) /.test(i.text)).map((i) => i.text.replace(/^(Modifie|Écrit) /, '').split('/').pop()!))];
  const cmds = items.filter((i) => i.kind === 'commande').length;
  const other = items.length - reads - finds - items.filter((i) => i.kind === 'action' && /^(Modifie|Écrit) /.test(i.text)).length - cmds;
  const parts = [
    reads && `a lu ${plural(reads, 'fichier', 'fichiers')}`, finds && plural(finds, 'recherche', 'recherches'),
    edits.length && `a modifié ${edits.slice(0, 3).join(', ')}${edits.length > 3 ? ` et ${edits.length - 3} autres` : ''}`,
    cmds && plural(cmds, 'commande', 'commandes'), other > 0 && plural(other, 'note du programme', 'notes du programme'),
  ].filter(Boolean) as string[];
  return (
    <li className={`rc-work ${edits.length ? 'has-edits' : ''}`}>
      <button className="rc-work__line" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="rc-work__dots" aria-hidden="true" />
        <span className="rc-work__sum">{parts.join(' · ')}</span>
        <span className="rc-work__more">{open ? 'Replier' : `Voir les ${items.length}`}</span>
      </button>
      {open && (
        <ol className="rc-work__list">
          {items.map((i) => <li key={i.id}><span className="rc-work__t">{hm(i.at)}</span><span className="rc-work__x">{i.text}</span></li>)}
        </ol>
      )}
    </li>
  );
}

function Moment({ it }: { it: LiveItem }) {
  const Icon = ICON[it.kind] ?? Info;
  const tone = it.ok === false || it.kind === 'bug' ? 'ko' : it.ok || it.kind === 'resolu' ? 'ok' : it.who === 'vous' ? 'you' : it.kind === 'message' ? 'say' : it.kind === 'reflexion' ? 'think' : 'info';
  const who = it.who === 'vous' ? 'Vous' : it.who === 'programme' ? 'Programme' : it.kind === 'reflexion' ? 'Réflexion' : it.kind === 'message' ? 'L’agent' : KIND[it.kind];
  return (
    <li className={`rc-m is-${tone} rc-m--${it.kind}`}>
      <span className="rc-m__dot" aria-hidden="true"><Icon size={13} /></span>
      <div className="rc-m__body">
        <div className="rc-m__meta"><span className="rc-m__who">{who}</span><time>{hm(it.at)}</time></div>
        <div className="rc-m__text">{it.text}</div>
        {it.detail && <div className="rc-m__detail">{it.detail.split('\n')[0]}</div>}
      </div>
    </li>
  );
}

// Le plan en une barre : chaque étape est un segment ; un clic montre sa preuve.
function PlanRail({ t }: { t: Ticket }) {
  const [sel, setSel] = useState<string | null>(null);
  const cur = t.steps.find((s) => s.id === sel);
  return (
    <div className="rc-plan">
      <ol className="rc-rail">
        {t.steps.map((s, i) => (
          <li key={s.id} className={`rc-seg is-${s.state} ${sel === s.id ? 'is-sel' : ''}`}>
            <button onClick={() => setSel(sel === s.id ? null : s.id)} aria-expanded={sel === s.id} title={s.label}>
              <span className="rc-seg__bar" aria-hidden="true" />
              <span className="rc-seg__n">{s.state === 'prouve' ? <Check size={11} strokeWidth={3} /> : s.state === 'annonce' ? '!' : i + 1}</span>
              <span className="rc-seg__label">{s.label}</span>
              <span className="sr-only">, {s.state === 'prouve' ? 'prouvée' : s.state === 'annonce' ? 'annoncée sans preuve' : s.state === 'en-cours' ? 'en cours' : 'à faire'}</span>
            </button>
          </li>
        ))}
      </ol>
      {cur && (
        <div className={`rc-proof is-${cur.state}`}>
          <b>{cur.state === 'prouve' ? 'Prouvé' : cur.state === 'annonce' ? 'Annoncé, pas prouvé' : 'Preuve attendue'}</b>
          <span>{cur.state === 'prouve' || cur.state === 'annonce' ? cur.evidence : cur.proof.text}</span>
          <span className="rc-proof__who">{roleName(cur.role)}</span>
        </div>
      )}
    </div>
  );
}

export function Deroule({ t, feed, loading, demo, onValidatePlan, onSimulate }: {
  t: Ticket; feed: LiveItem[]; loading?: boolean; demo: boolean; onValidatePlan: () => void; onSimulate: () => void;
}) {
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<Filter>('tout');
  const listRef = useRef<HTMLOListElement>(null);
  const proven = t.steps.filter((s) => s.state === 'prouve').length;
  const running = t.status === 'en-cours';
  const tours = useMemo(() => toTours(feed), [feed]);
  const shown = useMemo(() => (filter === 'tout' ? feed : feed.filter((x) => IN[filter].includes(x.kind))), [feed, filter]);
  const count = (f: Exclude<Filter, 'tout'>) => feed.filter((x) => IN[f].includes(x.kind)).length;
  const label = (f: Exclude<Filter, 'tout'>, name: string) => (count(f) ? `${name} ${count(f)}` : name);

  // Le détail suit le travail : on descend en bas, sauf si vous êtes remonté lire.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTo({ top: el.scrollHeight });
  }, [shown.length]);

  return (
    <div className="rc">
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

      <section aria-labelledby="rc-plan">
        <div className="rc-head">
          <h3 id="rc-plan">Le plan</h3>
          <span className="rc-head__aside">{proven} sur {t.steps.length} étapes prouvées par le programme</span>
        </div>
        <PlanRail t={t} />
      </section>

      <section aria-labelledby="rc-story">
        <div className="rc-head">
          <h3 id="rc-story">Le récit {running && <span className="rc-live">en direct</span>}</h3>
          <div className="rc-switch" role="group" aria-label="Affichage">
            <button aria-pressed={!all} onClick={() => setAll(false)}>Récit</button>
            <button aria-pressed={all} onClick={() => setAll(true)}>Tout le détail</button>
          </div>
        </div>
        {loading ? <p className="faint small">Lecture du journal du ticket…</p> : feed.length === 0 ? (
          <div className="empty empty--left">
            {t.status === 'a-faire' && <p>Le récit commence au lancement : ce que l’agent fait et dit, les étapes prouvées, les tests, les problèmes et comment ils sont réglés.</p>}
            {running && demo && (<><p>Aucun agent n’est branché sur ce projet d’exemple. Jouez un déroulé pour voir à quoi ressemble le travail.</p><button className="btn btn--sm" onClick={onSimulate}>Simuler un déroulé</button></>)}
            {(t.status === 'termine' || t.status === 'a-tester') && <p>Ce ticket a été fait avant le journal détaillé : seul le résultat est gardé, dans « Réalisé ».</p>}
          </div>
        ) : !all ? (
          <div className="rc-tours">
            {tours.map((tour, i) => (
              <article key={i} className="rc-tour">
                <header className="rc-tour__head">
                  <h4>{tour.title}</h4>
                  <span>{hm(tour.start)}{tour.end && tour.end !== tour.start ? ` – ${hm(tour.end)}` : ''}{minutes(tour.start, tour.end) > 1 ? ` · ${minutes(tour.start, tour.end)} min` : ''}{tour.model ? ` · ${tour.model}` : ''}</span>
                </header>
                <ol className="rc-tl">
                  {tour.entries.map((e, j) => (e.type === 'moment' ? <Moment key={e.it.id} it={e.it} /> : <WorkLine key={`w${j}`} items={e.items} />))}
                </ol>
              </article>
            ))}
          </div>
        ) : (
          <>
            <Tabs<Filter> label="Filtrer le détail" value={filter} onChange={setFilter} tabs={[
              { id: 'tout', label: 'Tout' }, { id: 'reflexion', label: label('reflexion', 'Réflexion') }, { id: 'actions', label: label('actions', 'Actions') },
              { id: 'bugs', label: label('bugs', 'Bugs') }, { id: 'tests', label: label('tests', 'Tests') },
            ]} />
            <ol className="feed" ref={listRef} aria-live="polite" style={{ marginTop: 10 }}>
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
          </>
        )}
      </section>
    </div>
  );
}
