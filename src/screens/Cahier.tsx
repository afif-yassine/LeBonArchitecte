// Cahier des charges (point 2) : couverture des exigences, architecture, vie d'un ticket,
// et discussion avec l'Architecte. Les cases se cochent seules : une exigence est « faite » seulement
// quand le ticket qui la couvre en entier est terminé (donc ses preuves vérifiées par le programme).
import { useMemo, useState } from 'react';
import { BookOpen, Check, CircleDashed, FileText, Loader2, MessageSquareText, Sparkles, X } from 'lucide-react';
import { useStore } from '../store';
import { useNotify } from '../components/notify';
import { Markdown } from '../components/Markdown';
import { fmtTokens } from '../components/ui';
import { useApi } from './RealSpaces';
import type { Go } from '../view';
import type { Ticket } from '../shared/contract';
import '../cahier.css'; // styles de cet écran seulement

interface Req { id: string; title: string; text: string; section: string }
interface CdcData { title: string; intro: string; version: string; requirements: Req[]; path: string }
interface Proposal { titre: string; pourquoi: string; attendu?: string; criteres?: string[]; exigences?: string[]; perturbe_le_travail_en_cours?: boolean }
interface Answer { verdict?: string; faisable?: string[]; a_enlever?: { quoi: string; pourquoi: string }[]; risques?: string[]; impact_en_cours?: string[]; propositions?: Proposal[]; reponse?: string }
interface Review { id: number; at: string; question: string; answer: Answer; tokens: number; model: string; decisions: Record<number, { decision: 'acceptee' | 'refusee'; ticket?: string }> }

type State = 'faite' | 'partie' | 'cours' | 'afaire' | 'aucun';
const STATE: Record<State, { label: string; cls: string }> = {
  faite: { label: 'Faite', cls: 'ok' },
  partie: { label: 'En partie', cls: 'part' },
  cours: { label: 'En cours', cls: 'run' },
  afaire: { label: 'Prévue', cls: 'todo' },
  aucun: { label: 'Aucun ticket', cls: 'none' },
};
const STATUS_LABEL: Record<Ticket['status'], string> = { 'a-faire': 'à faire', 'en-cours': 'en cours', action: 'besoin d’action', 'a-tester': 'à tester', termine: 'fini' };

function stateOf(r: Req, tickets: Ticket[]): { state: State; links: { t: Ticket; full: boolean }[] } {
  const links = tickets.flatMap((t) => {
    const ref = t.description.cdcRefs?.find((x) => x.replace('~', '') === r.id);
    return ref ? [{ t, full: !ref.endsWith('~') }] : [];
  });
  if (!links.length) return { state: 'aucun', links };
  const full = links.filter((l) => l.full);
  if (full.length && full.every((l) => l.t.status === 'termine')) return { state: 'faite', links };
  if (links.some((l) => l.t.status === 'termine')) return { state: 'partie', links };
  if (links.some((l) => l.t.status !== 'a-faire')) return { state: 'cours', links };
  return { state: 'afaire', links };
}

// ---------- Schémas (dessinés avec les couleurs du thème, clair ou sombre) ----------
function Box({ x, y, w, h, title, sub, tone }: { x: number; y: number; w: number; h: number; title: string; sub?: string; tone?: 'accent' | 'soft' }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} className={`dg__box ${tone === 'accent' ? 'is-accent' : tone === 'soft' ? 'is-soft' : ''}`} />
      <text x={x + 14} y={y + 24} className="dg__title">{title}</text>
      {sub && sub.split('\n').map((s, i) => <text key={i} x={x + 14} y={y + 43 + i * 16} className="dg__sub">{s}</text>)}
    </g>
  );
}
const Arrow = ({ d, label, lx, ly }: { d: string; label?: string; lx?: number; ly?: number }) => (
  <g><path d={d} className="dg__arrow" markerEnd="url(#dg-head)" />{label && <text x={lx} y={ly} className="dg__label">{label}</text>}</g>
);

function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 980 380" className="dg" role="img" aria-label="Architecture : vous et l’interface parlent au moteur local ; le moteur lance les agents dans un espace de travail par ticket ; le travail validé est réuni dans main après des tests verts.">
      <defs><marker id="dg-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="dg__head" /></marker></defs>
      <Box x={20} y={40} w={190} h={92} title="Vous" sub={'décidez, validez,\nfaites la recette'} tone="soft" />
      <Box x={20} y={176} w={190} h={92} title="Interface" sub={'tableau, déroulé, documents\nmise à jour en direct'} />
      <rect x={262} y={20} width={404} height={268} rx={14} className="dg__zone" />
      <text x={282} y={46} className="dg__zonet">Moteur local (127.0.0.1)</text>
      <Box x={282} y={62} w={176} h={86} title="Règles et pilote" sub={'0 token : file, dépendances,\ndéfinition de fini'} tone="accent" />
      <Box x={472} y={62} w={176} h={86} title="Journal" sub={'chaque événement gardé\n(SQLite), rien ne se perd'} />
      <Box x={282} y={164} w={176} h={104} title="Superviseur" sub={'lance, reprend, arrête\nvérifie chaque preuve\nréunit après tests verts'} tone="accent" />
      <Box x={472} y={164} w={176} h={104} title="Exécuteur" sub={'tests et commandes\njournal complet gardé\nrésumé court à l’agent'} />
      <Box x={720} y={20} w={240} h={124} title="Agents (Claude Code)" sub={'Opus : architecture, risques\nSonnet : travail normal\nHaiku : texte, recherche'} />
      <Box x={720} y={164} w={240} h={104} title="Architecte et mode direct" sub={'un seul appel, sans outils\ncontexte préparé par le\nprogramme'} tone="soft" />
      <rect x={20} y={310} width={940} height={58} rx={12} className="dg__zone" />
      <text x={40} y={334} className="dg__zonet">Projet sur le disque</text>
      <text x={40} y={354} className="dg__sub">un espace de travail par ticket (.lba/worktrees) · main reçoit seulement un travail validé, testé · docs/ : cahier, décisions, rapports</text>
      <Arrow d="M115 132 L115 172" />
      <Arrow d="M210 222 L278 222" label="actions" lx={216} ly={214} />
      <Arrow d="M666 216 L716 216" label="lance" lx={672} ly={208} />
      <Arrow d="M666 82 L716 82" label="modèle" lx={670} ly={74} />
      <Arrow d="M370 268 L370 306" label="réunion" lx={378} ly={294} />
      <Arrow d="M840 268 L840 306" label="travaille dans son espace" lx={848} ly={294} />
    </svg>
  );
}

const FLOW = [
  { t: 'Préparé', s: 'plan proposé\npar les règles' },
  { t: 'Plan validé', s: 'par vous,\navant tout lancement' },
  { t: 'En cours', s: 'agent dans son\nespace de travail' },
  { t: 'Tests', s: 'preuves vérifiées\npar le programme' },
  { t: 'À tester', s: 'votre recette :\nvalider ou réclamer' },
  { t: 'Terminé', s: 'réuni dans main,\ntests relancés' },
];
function FlowDiagram() {
  const w = 150, gap = 12;
  return (
    <svg viewBox={`0 0 ${FLOW.length * (w + gap)} 112`} className="dg" role="img" aria-label={`Vie d’un ticket : ${FLOW.map((f) => f.t).join(', puis ')}.`}>
      {FLOW.map((f, i) => {
        const x = i * (w + gap);
        const last = i === FLOW.length - 1;
        return (
          <g key={f.t}>
            <path d={`M${x} 6 H${x + w - 16} L${x + w} 36 L${x + w - 16} 66 H${x} ${i ? `L${x + 16} 36 Z` : 'Z'}`} className={`dg__step ${last ? 'is-accent' : ''}`} />
            <text x={x + (i ? 26 : 14)} y={41} className="dg__title">{f.t}</text>
            {f.s.split('\n').map((s, k) => <text key={k} x={x + (i ? 18 : 6)} y={86 + k * 15} className="dg__sub">{s}</text>)}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Discussion avec l'Architecte ----------
function ReviewCard({ r, projectId, go }: { r: Review; projectId: string; go: Go }) {
  const notify = useNotify();
  const a = r.answer ?? {};
  const decide = async (index: number, decision: 'acceptee' | 'refusee') => {
    const res = await fetch(`/api/projects/${projectId}/architect/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review: r.id, index, decision }) });
    notify(((await res.json()) as { message?: string }).message ?? 'Fait.');
  };
  const List = ({ title, items }: { title: string; items?: string[] }) => (items?.length ? <div className="rv__block"><h4>{title}</h4><ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null);
  return (
    <article className="rv">
      <header className="rv__head">
        <p className="rv__q">{r.question}</p>
        <span className="rv__meta">{new Date(r.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}, {r.model}, {fmtTokens(r.tokens)} tokens mesurés</span>
      </header>
      {a.verdict && <p className="rv__verdict">{a.verdict}</p>}
      {a.reponse && <p>{a.reponse}</p>}
      <div className="rv__grid">
        <List title="Faisable" items={a.faisable} />
        <List title="Risques" items={a.risques} />
        <List title="Impact sur le travail en cours" items={a.impact_en_cours} />
        {a.a_enlever?.length ? <div className="rv__block"><h4>À enlever ou reporter</h4><ul>{a.a_enlever.map((x, i) => <li key={i}><b>{x.quoi}</b> : {x.pourquoi}</li>)}</ul></div> : null}
      </div>
      {a.propositions?.length ? (
        <div className="rv__props">
          <h4>Propositions <span className="faint">rien n’est appliqué sans vous : accepter crée un ticket « à faire », plan à valider</span></h4>
          {a.propositions.map((p, i) => {
            const d = r.decisions[i];
            return (
              <div key={i} className={`prop ${d ? `is-${d.decision}` : ''}`}>
                <div className="prop__body">
                  <p className="prop__title">{p.titre}{p.exigences?.length ? <span className="prop__refs">{p.exigences.join(' ')}</span> : null}</p>
                  <p className="prop__why">{p.pourquoi}</p>
                  {p.perturbe_le_travail_en_cours && <p className="prop__warn">Touche du travail en cours : à faire après les tickets concernés.</p>}
                </div>
                <div className="prop__acts">
                  {d ? (d.decision === 'acceptee'
                    ? <button className="btn btn--sm" onClick={() => d.ticket && go({ kind: 'ticket', ticketId: d.ticket })}><Check size={14} /> {d.ticket}</button>
                    : <span className="faint small">Refusée</span>)
                    : <>
                      <button className="btn btn--sm btn--primary" onClick={() => decide(i, 'acceptee')}>Accepter</button>
                      <button className="btn btn--sm btn--ghost" onClick={() => decide(i, 'refusee')}>Refuser</button>
                    </>}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

function ArchitectPanel({ projectId, go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const { data } = useApi<{ busy: boolean; reviews: Review[] }>(`/projects/${projectId}/architect`);
  const [q, setQ] = useState('');
  const ask = async (body: { mode?: string; question?: string }) => {
    const res = await fetch(`/api/projects/${projectId}/architect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    notify(((await res.json()) as { message?: string }).message ?? 'Envoyé.');
    setQ('');
  };
  return (
    <section className="section" aria-labelledby="cdc-arch" id="architecte">
      <div className="section__head"><h2 id="cdc-arch">Discuter avec l’Architecte</h2><span className="muted small">Opus, réflexion poussée ; environ 15 000 tokens par réponse, mesurés</span></div>
      <div className="ask">
        <div className="ask__quick">
          <button className="btn" disabled={data?.busy} onClick={() => ask({ mode: 'revue' })}><Sparkles size={15} /> Revue complète : faisable, à enlever, risques</button>
          <button className="btn" disabled={data?.busy} onClick={() => ask({ mode: 'en-cours' })}><MessageSquareText size={15} /> Le projet a commencé : que changer sans le perturber ?</button>
        </div>
        <form className="ask__form" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask({ question: q }); }}>
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} placeholder="Votre question sur le cahier des charges, par exemple : « Peut-on enlever E13 pour aller plus vite ? »" aria-label="Question à l’Architecte" />
          <button className="btn btn--primary" disabled={data?.busy || !q.trim()}>Demander</button>
        </form>
        {data?.busy && <p className="ask__busy"><Loader2 size={15} className="spin" /> L’Architecte relit le cahier, les tickets et les décisions…</p>}
      </div>
      <div className="rv__list">
        {data?.reviews.map((r) => <ReviewCard key={r.id} r={r} projectId={projectId} go={go} />)}
        {data && !data.reviews.length && !data.busy && <p className="muted small">Aucune discussion pour l’instant. La revue complète est un bon début.</p>}
      </div>
    </section>
  );
}

// ---------- Écran ----------
export function CahierScreen({ projectId, go }: { projectId: string; go: Go }) {
  const { tickets } = useStore();
  const { data: cdc, error } = useApi<CdcData>(`/projects/${projectId}/cdc`);
  const [full, setFull] = useState(false);
  const { data: raw } = useApi<{ content: string }>(full && cdc ? `/projects/${projectId}/doc?path=${encodeURIComponent(cdc.path)}` : '/health');
  const mine = useMemo(() => tickets.filter((t) => t.projectId === projectId), [tickets, projectId]);
  const rows = useMemo(() => (cdc?.requirements ?? []).map((r) => ({ r, ...stateOf(r, mine) })), [cdc, mine]);
  const count = (s: State) => rows.filter((x) => x.state === s).length;
  const sections = [...new Set(rows.map((x) => x.r.section))];

  if (!cdc) return <div className="page"><h1>Cahier des charges</h1><p className={error ? '' : 'faint'}>{error ?? 'Lecture du cahier…'}</p></div>;
  return (
    <div className="page page--lib cdc">
      <header className="cdc__head">
        <div>
          <h1>Cahier des charges</h1>
          <p className="lead">{cdc.intro}</p>
          <p className="faint small">{cdc.version} Fichier : <code>{cdc.path}</code></p>
        </div>
        <div className="cdc__acts">
          <button className="btn" onClick={() => setFull((v) => !v)}><BookOpen size={15} /> {full ? 'Revenir à la vue d’ensemble' : 'Lire le texte complet'}</button>
          <a className="btn btn--primary" href="#architecte"><Sparkles size={15} /> Discuter avec l’Architecte</a>
        </div>
      </header>

      {full ? (
        <article className="doc" style={{ marginTop: 24 }}>
          <div className="doc__body">{raw?.content ? <Markdown text={raw.content.replace(/^\s*# .+\r?\n/, '')} /> : <p className="faint">Lecture…</p>}</div>
        </article>
      ) : (
        <>
          <section className="cover" aria-labelledby="cdc-cover">
            <div className="cover__top">
              <h2 id="cdc-cover">Couverture des {rows.length} exigences</h2>
              <ul className="cover__legend">
                {(Object.keys(STATE) as State[]).map((s) => <li key={s}><span className={`tile tile--${STATE[s].cls} tile--dot`} aria-hidden="true" /> {STATE[s].label} <b>{count(s)}</b></li>)}
              </ul>
            </div>
            <div className="cover__map" role="list">
              {rows.map(({ r, state }) => (
                <a key={r.id} role="listitem" href={`#req-${r.id}`} className={`tile tile--${STATE[state].cls}`} title={`${r.id} ${r.title} : ${STATE[state].label}`}>
                  <span className="tile__id">{r.id}</span><span className="tile__t">{r.title}</span>
                </a>
              ))}
            </div>
            <p className="xsmall faint">Une exigence n’est « faite » que lorsque le ticket qui la couvre en entier est terminé, donc ses preuves vérifiées par le programme et votre recette faite. « En partie » : un ticket fini en couvre une partie.</p>
          </section>

          <section className="section" aria-labelledby="cdc-archi">
            <div className="section__head"><h2 id="cdc-archi">Architecture</h2><span className="muted small">ce qui tourne sur votre PC aujourd’hui</span></div>
            <div className="dg__frame"><ArchitectureDiagram /></div>
          </section>

          <section className="section" aria-labelledby="cdc-flow">
            <div className="section__head"><h2 id="cdc-flow">Vie d’un ticket</h2><span className="muted small">une porte par étape, rien ne passe sans preuve</span></div>
            <div className="dg__frame"><FlowDiagram /></div>
          </section>

          <section className="section" aria-labelledby="cdc-reqs">
            <div className="section__head"><h2 id="cdc-reqs">Exigences</h2><span className="muted small">cochées automatiquement, jamais à la main</span></div>
            {sections.map((sec) => (
              <div key={sec} className="rqs">
                <h3 className="rqs__sec">{sec}</h3>
                <ul>
                  {rows.filter((x) => x.r.section === sec).map(({ r, state, links }) => (
                    <li key={r.id} id={`req-${r.id}`} className={`rq is-${STATE[state].cls}`}>
                      <span className="rq__mark" aria-label={STATE[state].label}>
                        {state === 'faite' ? <Check size={13} strokeWidth={3} /> : state === 'partie' ? <span className="rq__half" /> : state === 'aucun' ? <X size={12} strokeWidth={2.5} /> : state === 'cours' ? <CircleDashed size={13} /> : null}
                      </span>
                      <div className="rq__body">
                        <p className="rq__title"><span className="rq__id">{r.id}</span> {r.title} <span className={`rq__state is-${STATE[state].cls}`}>{STATE[state].label}</span></p>
                        <p className="rq__text">{r.text}</p>
                        {links.length > 0 && (
                          <div className="rq__links">
                            {links.map(({ t, full: f }) => (
                              <button key={t.id} className={`tchip is-${t.status}`} onClick={() => go({ kind: 'ticket', ticketId: t.id })} title={`${t.title} : ${STATUS_LABEL[t.status]}${f ? '' : ', couvre une partie'}`}>
                                <FileText size={12} aria-hidden="true" /> {t.id} <span>{STATUS_LABEL[t.status]}{f ? '' : ', en partie'}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}

      <ArchitectPanel projectId={projectId} go={go} />
    </div>
  );
}
