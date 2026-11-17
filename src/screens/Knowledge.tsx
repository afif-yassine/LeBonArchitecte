// Règles du projet, mémoire partagée et contexte des agents.
import { useState } from 'react';
import { Bot, FileCode2, Globe, Lock, Plus, Search, ShieldCheck, Trash2, User } from 'lucide-react';
import { agentContexts, agentRoles, agents, injected, memory as initialMemory, memoryStats, projectRules, roles } from '../mock/data';
import type { AgentContext, MemoryNote, ProjectRule } from '../shared/contract';
import { Tabs, fmtTokens, toolShort } from '../components/ui';
import { useNotify } from '../components/notify';
import type { Go } from '../view';

const SOURCE = { vous: 'Vous', decision: 'Décision', convention: 'Convention', recette: 'Recette' } as const;

export function Rules() {
  const notify = useNotify();
  const [list, setList] = useState<ProjectRule[]>(projectRules);
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'projet' | 'global'>('projet');
  const total = list.reduce((s, r) => s + r.tokens, 0);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setList((l) => [...l, { id: `R-${l.length + 1}`, text: t, scope, source: 'vous', enforcedBy: 'agent', tokens: Math.ceil(t.length / 3.5) }]);
    setText('');
    notify('Règle ajoutée. CLAUDE.md et AGENTS.md sont regénérés pour tous les agents du projet.');
  };

  const group = (s: 'global' | 'projet') => list.filter((r) => r.scope === s);

  return (
    <div className="page">
      <h1>Règles du projet</h1>
      <p className="lead">Une seule liste. Le programme la recopie dans CLAUDE.md (Claude Code) et AGENTS.md (Codex) : chaque agent lit les mêmes règles, et rien d’autre.</p>

      <div className="kpis" style={{ margin: '26px 0 30px' }}>
        <div className="kpi"><div className="kpi__v">{list.length}</div><div className="kpi__l">règles</div></div>
        <div className="kpi"><div className="kpi__v">{total}</div><div className="kpi__l">tokens lus par chaque agent</div></div>
        <div className="kpi"><div className="kpi__v">{list.filter((r) => r.enforcedBy === 'programme').length}</div><div className="kpi__l">bloquées par le programme</div></div>
        <div className="kpi"><div className="kpi__v">2</div><div className="kpi__l">fichiers générés</div></div>
      </div>

      {(['global', 'projet'] as const).map((s) => (
        <section key={s} className="section" style={{ marginTop: s === 'global' ? 0 : 34 }}>
          <div className="section__head">
            <h2>{s === 'global' ? 'Règles de tous vos projets' : 'Règles de ce projet'}</h2>
            <span className="small muted num">{group(s).reduce((x, r) => x + r.tokens, 0)} tokens</span>
          </div>
          <div className="box box--flush">
            {group(s).map((r) => (
              <div key={r.id} className="rule-row">
                <span className="rule-row__id">{r.id}</span>
                <div className="rule-row__text">{r.text}</div>
                <span className="tag">{SOURCE[r.source]}</span>
                {r.enforcedBy === 'programme'
                  ? <span className="pill pill--sec" title="Le programme bloque toute action contraire"><ShieldCheck size={12} />bloquée</span>
                  : <span className="pill" title="Consigne lue par l’agent">consigne</span>}
                <span className="xsmall faint num" style={{ width: 48, textAlign: 'right' }}>{r.tokens} tk</span>
                <button className="btn btn--ghost btn--icon btn--sm" aria-label={`Retirer ${r.id}`} onClick={() => { setList((l) => l.filter((x) => x.id !== r.id)); notify(`${r.id} retirée. Fichiers regénérés.`); }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      ))}

      <form className="addrule" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nouvelle règle, en une phrase courte" aria-label="Nouvelle règle" />
        <div className="seg">
          <button type="button" aria-pressed={scope === 'projet'} onClick={() => setScope('projet')}>Ce projet</button>
          <button type="button" aria-pressed={scope === 'global'} onClick={() => setScope('global')}>Tous les projets</button>
        </div>
        <button className="btn btn--primary" type="submit"><Plus size={15} />Ajouter</button>
      </form>

      <section className="section">
        <h2>Fichiers générés</h2>
        <div className="grid2">
          {['CLAUDE.md', 'AGENTS.md'].map((f) => (
            <div key={f} className="box">
              <div className="row"><FileCode2 size={16} className="faint" /><span className="strong mono">{f}</span><span className="pill pill--ok" style={{ marginLeft: 'auto' }}>à jour</span></div>
              <p className="small muted" style={{ marginTop: 6 }}>Lu par {f === 'CLAUDE.md' ? 'Claude Code' : 'Codex'}. Ne pas modifier à la main : il est regénéré à chaque changement de règle.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const KIND = { fait: 'Fait', recette: 'Recette', preference: 'Préférence', decision: 'Décision' } as const;
const PART_COLOR = { regles: 'var(--sec)', ticket: 'var(--accent-fill)', graphe: 'oklch(.72 .1 230)', memoire: 'var(--ok)', fichiers: 'var(--wait)', conversation: 'oklch(from var(--text) l c h / .35)' } as const;

function ContextCard({ c, go }: { c: AgentContext; go: Go }) {
  const a = agents.find((x) => x.id === c.agentId)!;
  const role = roles.find((r) => r.id === agentRoles[a.id]);
  const total = c.parts.reduce((s, p) => s + p.tokens, 0);
  const pct = Math.round((total / c.ceiling) * 100);
  const notes = injected[a.ticketId] ?? [];
  return (
    <div className="ctx">
      <div className="ctx__head">
        <span className="avatar avatar--agent"><Bot size={13} /></span>
        <button className="link strong" style={{ color: 'var(--text-strong)' }} onClick={() => go({ kind: 'ticket', ticketId: a.ticketId })}>{a.name}, {a.ticketId}</button>
        <span className="faint small">{role?.name}, {toolShort(a.tool)} {a.model}</span>
        <span className={`ctx__total ${pct >= 80 ? 'is-high' : ''}`}><b className="num">{fmtTokens(total)}</b> sur {fmtTokens(c.ceiling)}</span>
      </div>
      <div className="stack" role="img" aria-label={c.parts.map((p) => `${p.label} ${fmtTokens(p.tokens)}`).join(', ')}>
        {c.parts.map((p) => <span key={p.label} style={{ width: `${(p.tokens / c.ceiling) * 100}%`, background: PART_COLOR[p.kind] }} title={`${p.label} : ${fmtTokens(p.tokens)}`} />)}
        <i style={{ left: '85%' }} title="Seuil de compactage (85 %)" />
      </div>
      <div className="ctx__parts">
        {c.parts.map((p) => (
          <div key={p.label} className="ctx__part">
            <span className="ctx__sw" style={{ background: PART_COLOR[p.kind] }} />
            <span className="ctx__label">{p.label}</span>
            <span className="ctx__detail">{p.detail}</span>
            <span className="num ctx__tok">{fmtTokens(p.tokens)}</span>
          </div>
        ))}
      </div>
      {pct >= 80 && <p className="flag flag--wait" style={{ marginTop: 10 }}>Presque au seuil : la conversation pèse lourd. Compactage une fois, puis session neuve avec passation.</p>}
      {notes.length > 0 && <p className="xsmall faint" style={{ marginTop: 8 }}>Mémoire reçue : {notes.map((n) => n.id).join(', ')}, choisies par pertinence avec le ticket.</p>}
    </div>
  );
}

export function MemoryContext({ go }: { go: Go }) {
  const notify = useNotify();
  const [tab, setTab] = useState<'memoire' | 'contexte' | 'strategie'>('memoire');
  const [list, setList] = useState<MemoryNote[]>(initialMemory);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'tout' | 'global' | 'projet'>('tout');
  const shown = list.filter((n) => (scope === 'tout' || n.scope === scope) && n.text.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <h1>Mémoire et contexte</h1>
      <p className="lead">Ce que l’équipe sait déjà, et ce que chaque agent a vraiment en tête. Le but : le moins de tokens possible, sans rien oublier.</p>

      <div className="kpis" style={{ margin: '26px 0 26px' }}>
        <div className="kpi"><div className="kpi__v">{memoryStats.total}</div><div className="kpi__l">notes en mémoire</div></div>
        <div className="kpi"><div className="kpi__v">{fmtTokens(memoryStats.totalTokens)}</div><div className="kpi__l">tokens si on lisait tout</div></div>
        <div className="kpi"><div className="kpi__v">{memoryStats.injectedPerTicket}</div><div className="kpi__l">tokens reçus par ticket</div></div>
        <div className="kpi"><div className="kpi__v" style={{ color: 'var(--ok)' }}>−{fmtTokens(memoryStats.savedPerAgent)}</div><div className="kpi__l">économisés par agent</div></div>
      </div>

      <Tabs label="Mémoire et contexte" value={tab} onChange={setTab} tabs={[{ id: 'memoire', label: 'Mémoire partagée' }, { id: 'contexte', label: 'Contexte des agents' }, { id: 'strategie', label: 'Comment ça marche' }]} />

      {tab === 'memoire' && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
              <Search size={15} className="faint" style={{ position: 'absolute', left: 11, top: 10 }} aria-hidden="true" />
              <input className="input" style={{ paddingLeft: 33 }} placeholder="Chercher dans la mémoire" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Chercher dans la mémoire" />
            </div>
            <div className="seg">
              <button aria-pressed={scope === 'tout'} onClick={() => setScope('tout')}>Tout</button>
              <button aria-pressed={scope === 'global'} onClick={() => setScope('global')}>Tous les projets</button>
              <button aria-pressed={scope === 'projet'} onClick={() => setScope('projet')}>Ce projet</button>
            </div>
          </div>
          <div className="box box--flush">
            {shown.map((n) => (
              <div key={n.id} className="note">
                <span className={`note__scope ${n.scope === 'global' ? 'is-global' : ''}`} title={n.scope === 'global' ? 'Partagée par tous les projets' : 'Ce projet seulement'}>{n.scope === 'global' ? <Globe size={13} /> : <Lock size={12} />}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="strong" style={{ fontWeight: 500 }}>{n.text}</div>
                  <div className="xsmall faint">{KIND[n.kind]}. Source : {n.source}. Reçue {n.uses} fois par des agents.</div>
                </div>
                <span className="xsmall faint num">{n.tokens} tk</span>
                <button className="btn btn--ghost btn--icon btn--sm" aria-label="Oublier cette note" title="Oublier (note fausse)" onClick={() => { setList((l) => l.filter((x) => x.id !== n.id)); notify('Note oubliée. Les agents ne la recevront plus.'); }}><Trash2 size={14} /></button>
              </div>
            ))}
            {shown.length === 0 && <p className="faint" style={{ padding: '14px 0' }}>Aucune note ne correspond.</p>}
          </div>
        </>
      )}

      {tab === 'contexte' && (
        <>
          <div className="legend" style={{ margin: '0 0 14px' }}>
            {Object.entries({ regles: 'Règles', ticket: 'Ticket', graphe: 'Graphe', memoire: 'Mémoire', fichiers: 'Fichiers lus', conversation: 'Conversation' }).map(([k, l]) => <span key={k}><i style={{ background: PART_COLOR[k as keyof typeof PART_COLOR] }} />{l}</span>)}
            <span><i style={{ background: 'var(--text-strong)', width: 2 }} />Seuil de compactage</span>
          </div>
          <div className="ctxlist">{agentContexts.map((c) => <ContextCard key={c.agentId} c={c} go={go} />)}</div>
        </>
      )}

      {tab === 'strategie' && (
        <div className="report">
          <ol className="howto">
            <li><b>Une note = un fait court.</b> 10 à 30 tokens. Avant d’écrire, le programme cherche une note proche : il la met à jour au lieu d’en créer une autre.</li>
            <li><b>Deux étages.</b> La mémoire de tous les projets (recettes Windows, vos préférences, savoir sur les outils) et la mémoire de chaque projet. Un nouveau projet profite tout de suite de ce qui est déjà connu.</li>
            <li><b>Personne ne lit tout.</b> Pour chaque ticket, le programme choisit 3 à 8 notes par pertinence (mots du ticket, fichiers touchés, voisins dans le graphe). Plafond : 600 tokens.</li>
            <li><b>Recherche locale, 0 token.</b> Index plein texte SQLite, plus des « vecteurs » calculés sur votre PC par un petit modèle (environ 25 Mo, sans carte graphique). Aucun appel payant.</li>
            <li><b>À la demande.</b> Si un agent a besoin d’autre chose, il interroge la mémoire par un outil et reçoit 3 notes, pas plus.</li>
            <li><b>Écrite par le programme.</b> Les agents proposent des notes dans leur passation ; le programme les dédoublonne et les range. Les notes jamais utilisées ou contredites sont signalées pour être oubliées.</li>
            <li><b>Contexte plafonné.</b> 60 k par agent, bien en dessous de la fenêtre du modèle. À 85 % : un compactage natif, une seule fois, puis session neuve avec passation.</li>
          </ol>
          <p className="small muted" style={{ marginTop: 16 }}><User size={13} style={{ verticalAlign: '-2px' }} /> Vous voyez et corrigez tout ici. Rien n’est caché aux agents ni à vous.</p>
        </div>
      )}
    </div>
  );
}
