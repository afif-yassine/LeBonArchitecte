import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowLeftRight, Bot, Check, ChevronDown, FileCheck2, FileClock, FilePen, FileText, GitBranch, GitCommitHorizontal,
  Image as ImageIcon, Info, Lock, Paperclip, Pause, Play, Plus, Scale, SendHorizontal, Settings2, Square, Terminal, User, X,
} from 'lucide-react';
import { accounts, agentRoles, agents, conversations, events, requirements, roles } from '../mock/data';
import { TOOLS, type ConversationItem, type Effort, type LogEvent, type ToolId } from '../shared/contract';
import { Bar, STATE, Tabs, fmtTokens } from '../components/ui';
import { LaunchDialog } from '../components/LaunchDialog';
import { useNotify } from '../components/notify';
import { useStore } from '../store';
import type { Go } from '../view';

type Tab = 'description' | 'conversation' | 'realise' | 'journal' | 'diff' | 'tests';
const EV_ICON: Record<LogEvent['kind'], typeof Info> = { lecture: FileText, modif: FilePen, commande: Terminal, question: Info, regle: Scale, info: Info };
const now = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function ToolMenu({ tool0, account0, model0, effort0, onClose, onApply }: {
  tool0: ToolId; account0: string; model0: string; effort0: Effort; onClose: () => void;
  onApply: (v: { tool: ToolId; accountId: string; model: string; effort: Effort }) => void;
}) {
  const [tool, setTool] = useState(tool0);
  const [accountId, setAccountId] = useState(account0);
  const [model, setModel] = useState(model0);
  const [effort, setEffort] = useState(effort0);
  const [keep, setKeep] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const pick = (t: ToolId) => {
    setTool(t);
    setAccountId(accounts.find((a) => a.tool === t && a.connected)?.id ?? '');
    setModel(TOOLS[t].models[TOOLS[t].models.length > 2 ? 1 : TOOLS[t].models.length - 1]);
  };

  return (
    <div className="menu" ref={ref} role="dialog" aria-label="Outil et modèle">
      <h3>Outil et modèle</h3>
      <div className="menu__row">
        <span>Outil</span>
        <div className="radios" role="radiogroup" aria-label="Outil">
          {(Object.keys(TOOLS) as ToolId[]).map((k) => {
            const ok = accounts.some((a) => a.tool === k && a.connected);
            return <button key={k} className="radio" role="radio" aria-checked={tool === k} disabled={!ok} title={ok ? '' : 'Non connecté'} onClick={() => pick(k)}>{TOOLS[k].label}</button>;
          })}
        </div>
      </div>
      <div className="menu__row">
        <span>Compte</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Compte">
          {accounts.filter((a) => a.tool === tool && a.connected).map((a) => <option key={a.id} value={a.id}>{a.label}, 5 h : {a.quota5h} %</option>)}
        </select>
      </div>
      <div className="menu__row">
        <span>Modèle</span>
        <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Modèle">
          {TOOLS[tool].models.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="menu__row">
        <span>Effort</span>
        <div className="radios" role="radiogroup" aria-label="Effort">
          {(['bas', 'moyen', 'haut'] as Effort[]).map((e) => <button key={e} className="radio" role="radio" aria-checked={effort === e} onClick={() => setEffort(e)}>{e}</button>)}
        </div>
      </div>
      <label className="cbx"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />Garder la conversation et la branche</label>
      <div className="menu__note"><Info size={14} />Le changement est appliqué à la fin du tour en cours. Le programme écrit la passation.</div>
      <div className="menu__note"><Lock size={14} />Fable : indisponible (règle du projet).</div>
      <div className="menu__foot">
        <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn--primary" onClick={() => onApply({ tool, accountId, model, effort })}>Appliquer</button>
      </div>
    </div>
  );
}

function Item({ it, onAnswer }: { it: ConversationItem; onAnswer: (choice: string) => void }) {
  if (it.type === 'cmd') return (
    <div className="tool">
      <span className="tool__kind">commande</span>
      <span className="tool__body">{it.command}</span>
      <span className={`tool__res ${it.ok ? 'is-ok' : 'is-ko'}`}>{it.ok ? <Check size={14} /> : <X size={14} />}{it.summary}</span>
    </div>
  );
  if (it.type === 'edit') return (
    <div className="tool">
      <span className="tool__kind">modifié</span>
      <span className="tool__body">{it.file}</span>
      <span className="diffstat"><span className="plus">+{it.plus}</span><span className="minus">−{it.minus}</span></span>
    </div>
  );
  if (it.type === 'question') return (
    <div className="question">
      <div className="question__text">Question : « {it.text} »</div>
      {it.answer
        ? <div className="answered"><Check size={13} style={{ verticalAlign: '-2px', color: 'var(--ok)' }} /> Répondu : {it.answer}</div>
        : <div className="row">{it.choices.map((c, i) => <button key={c} className={`btn btn--sm ${i === 0 ? 'btn--primary' : ''}`} onClick={() => onAnswer(c)}>{c}</button>)}</div>}
    </div>
  );
  const k = it.from.kind;
  return (
    <div className={`bubble bubble--${k}`}>
      <div className="bubble__who">
        <span className={`avatar ${k === 'agent' ? 'avatar--agent' : k === 'vous' ? 'avatar--vous' : ''}`}>{k === 'agent' ? <Bot size={13} /> : k === 'vous' ? <User size={13} /> : <Scale size={13} />}</span>
        <strong>{k === 'vous' ? 'Vous' : it.from.name}</strong><span className="faint">{it.at}</span>
      </div>
      <div className="bubble__text">{it.text}</div>
    </div>
  );
}

export function TicketView({ ticketId, go }: { ticketId: string; go: Go }) {
  const notify = useNotify();
  const { tickets, stop, finish, reports, validate, reject } = useStore();
  const [rejecting, setRejecting] = useState(false);
  const [problem, setProblem] = useState('');
  const t = tickets.find((x) => x.id === ticketId)!;
  const agent = t.status === 'en-cours' || t.status === 'action' ? agents.find((a) => a.id === t.agentId) : undefined;
  const role = agent ? roles.find((r) => r.id === agentRoles[agent.id]) : undefined;
  const realizedState = t.status === 'termine' || t.status === 'a-tester';
  const [tab, setTab] = useState<Tab>(t.status === 'en-cours' ? 'conversation' : realizedState ? 'realise' : 'description');
  const [conf, setConf] = useState({ tool: t.tool, accountId: t.accountId, model: t.model, effort: t.effort });
  const [menu, setMenu] = useState(false);
  const [paused, setPaused] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [items, setItems] = useState<ConversationItem[]>(conversations[t.id] ?? []);
  const [text, setText] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const account = accounts.find((a) => a.id === conf.accountId);
  const other: ToolId = conf.tool === 'codex' ? 'claude-code' : 'codex';
  const report = reports.find((r) => r.id === t.reportedIn);

  useEffect(() => { if (tab === 'conversation') bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }); }, [items, tab]);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    setItems((l) => [...l, { type: 'msg', from: { kind: 'vous', name: 'Vous' }, at: now(), text: v }]);
    setText('');
    notify('Message transmis à l’agent. Il le lira à la fin de son action en cours.');
  };
  const answer = (idx: number, choice: string) => {
    setItems((l) => l.map((x, i) => (i === idx && x.type === 'question' ? { ...x, answer: choice } : x)));
    notify(`Réponse « ${choice} » envoyée et écrite comme décision.`);
  };

  return (
    <div className="tk">
      <div className="tk__main">
        <div className="tk__head">
          <button className="btn btn--ghost btn--sm" onClick={() => go({ kind: 'projet', projectId: t.projectId, space: 'travail' })}><ArrowLeft size={15} />Travail</button>
          <div className="tk__title"><span className="card__id">{t.id}</span>{t.title}</div>
          <div style={{ marginLeft: 'auto', position: 'relative', flex: 'none' }}>
            <button className="btn btn--sm" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <Settings2 size={14} />Outil et modèle<ChevronDown size={14} />
            </button>
            {menu && (
              <ToolMenu tool0={conf.tool} account0={conf.accountId} model0={conf.model} effort0={conf.effort} onClose={() => setMenu(false)}
                onApply={(v) => { setConf(v); setMenu(false); notify(`Passera sur ${TOOLS[v.tool].label}, ${v.model}, à la fin du tour. Même dossier, même branche.`); }} />
            )}
          </div>
        </div>
        <div className="tk__tabs">
          <Tabs<Tab> label="Vues du ticket" value={tab} onChange={setTab} tabs={[
            { id: 'description', label: 'Description' }, { id: 'conversation', label: 'Conversation' }, { id: 'realise', label: 'Réalisé' },
            { id: 'journal', label: 'Journal' }, { id: 'diff', label: 'Diff' }, { id: 'tests', label: 'Tests' },
          ]} />
        </div>

        <div className="tk__body" ref={bodyRef}>
          {tab === 'description' && (
            <div className="descr">
              <div className="descr__block"><h3>Pourquoi</h3><p>{t.description.context}</p></div>
              <div className="descr__block"><h3>Ce qui est attendu</h3><p className="strong" style={{ fontWeight: 500 }}>{t.description.expected}</p></div>
              <div className="descr__block">
                <h3>Critères d’acceptation</h3>
                <ul className="checklist">
                  {t.criteria.map((c) => (
                    <li key={c.text} className={`check ${c.done ? 'is-ok' : ''}`}>
                      <span className="check__mark" aria-hidden="true">{c.done && <Check size={11} strokeWidth={3.5} />}</span>
                      <span>{c.text}<span className="sr-only">{c.done ? ', tenu' : ', à faire'}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="descr__block"><h3>Hors périmètre</h3><p className="muted">{t.description.outOfScope}</p></div>
              <div className="descr__block">
                <h3>Cahier des charges</h3>
                {t.description.cdcRefs.length === 0 ? <p className="faint">Aucune exigence liée.</p> : (
                  <div className="refs">
                    {t.description.cdcRefs.map((id) => {
                      const r = requirements.find((x) => x.id === id);
                      return <button key={id} className="ref" onClick={() => go({ kind: 'projet', projectId: t.projectId, space: 'cdc' })}><b>{id}</b>{r?.text}</button>;
                    })}
                  </div>
                )}
              </div>
              <div className="descr__block">
                <h3>Définition de fini, vérifiée par le programme</h3>
                <ul className="checklist" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                  {t.done.map((d) => (
                    <li key={d.label} className={`check ${d.state === 'ok' ? 'is-ok' : d.state === 'echec' ? 'is-fail' : ''}`}>
                      <span className="check__mark" aria-hidden="true">{d.state === 'ok' ? <Check size={11} strokeWidth={3.5} /> : d.state === 'echec' ? <X size={11} strokeWidth={3.5} /> : null}</span>
                      <span>{d.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'conversation' && (
            items.length === 0
              ? <p className="muted">Aucun échange pour l’instant. La conversation commence quand l’orchestrateur confie le ticket à un agent.</p>
              : <div className="convo">{items.map((it, i) => <Item key={i} it={it} onAnswer={(c) => answer(i, c)} />)}</div>
          )}

          {tab === 'realise' && (
            !t.realized ? (
              <div className="empty"><h3>Rien de réalisé pour l’instant</h3><p>À la fin du ticket, le programme écrit ici ce qui a été fait et ajouté, à partir des commits et des tests. Sans IA.</p></div>
            ) : (
              <div className="descr">
                {t.status === 'a-tester' && (
                  <div className="recette">
                    <h3>Recette : à vous de tester</h3>
                    <p className="small muted">Le programme a déjà vérifié les tests, les critères, les secrets et les failles. Il reste à essayer comme un vrai utilisateur.</p>
                    <ol className="steps" style={{ margin: '10px 0 14px' }}>
                      <li>Ouvrez l’aperçu : rien à compiler, les changements s’affichent tout de suite.</li>
                      <li>Essayez chaque critère d’acceptation.</li>
                      <li>Validez, ou décrivez ce qui ne va pas : le même agent corrige.</li>
                    </ol>
                    <div className="row">
                      <button className="btn" onClick={() => notify('Maquette : l’aperçu du projet s’ouvre dans un onglet (J5).')}>Ouvrir l’aperçu</button>
                      <button className="btn btn--primary" onClick={() => validate(t.id)}>Tout marche : valider</button>
                      <button className="btn" onClick={() => setRejecting(true)}>Ça ne marche pas</button>
                    </div>
                    {rejecting && (
                      <div className="recette__ko">
                        <label className="sr-only" htmlFor="ko">Ce qui ne marche pas</label>
                        <textarea id="ko" className="input" rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Ex. : le lien de connexion arrive, mais la page reste blanche sur mobile." />
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn--ghost btn--sm"><Paperclip size={14} />Joindre une capture</button>
                          <button className="btn btn--primary btn--sm" disabled={!problem.trim()} onClick={() => { reject(t.id, problem.trim()); setRejecting(false); setProblem(''); }}>Renvoyer à l’agent</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className={`crbadge ${t.reportedIn ? 'is-done' : 'is-new'}`}>
                  {t.reportedIn ? <FileCheck2 size={18} /> : <FileClock size={18} />}
                  {t.reportedIn
                    ? <span>Déjà rapporté dans le compte rendu <strong>{t.reportedIn}</strong> du {report?.date}.</span>
                    : <span><strong>Pas encore rapporté.</strong> Il sera dans le prochain compte rendu.</span>}
                  <button className="link" style={{ marginLeft: 'auto' }} onClick={() => go({ kind: 'projet', projectId: t.projectId, space: 'docs' })}>Comptes rendus</button>
                </div>
                <div className="descr__block"><h3>Résumé</h3><p className="realized__summary">{t.realized.summary}</p></div>
                <div className="descr__block">
                  <h3>Ajouté</h3>
                  <ul className="ulist">{t.realized.added.map((a) => <li key={a}><Plus size={13} />{a}</li>)}</ul>
                </div>
                <div className="descr__block">
                  <h3>Fichiers</h3>
                  <ul className="files">{t.realized.files.map((f) => <li key={f.path}><span className="mono">{f.path}</span><span className="diffstat"><span className="plus">+{f.plus}</span><span className="minus">−{f.minus}</span></span></li>)}</ul>
                </div>
                <div className="grid2">
                  <div className="box"><div className="box__title">Tests</div>{t.realized.tests}</div>
                  <div className="box">
                    <div className="box__title">Git</div>
                    <div className="flag"><GitBranch size={14} /><span className="mono">{t.realized.branch}</span></div>
                    {t.realized.commits.map((c) => <div key={c} className="flag" style={{ marginTop: 4 }}><GitCommitHorizontal size={14} /><span className="mono">{c}</span></div>)}
                  </div>
                </div>
              </div>
            )
          )}

          {tab === 'journal' && (
            <ol className="journal">
              {events.filter((e) => e.ticketId === t.id).map((e) => {
                const Icon = EV_ICON[e.kind];
                return (
                  <li key={e.id} className={`ev ev--${e.kind}`}>
                    <span className="ev__time">{e.at}</span>
                    <span className="ev__icon" aria-hidden="true"><Icon size={15} /></span>
                    <div><span className="ev__actor">{e.actor.name}</span> {e.text}</div>
                  </li>
                );
              })}
              {events.every((e) => e.ticketId !== t.id) && <p className="muted">Le journal se remplit dès que l’agent démarre.</p>}
            </ol>
          )}
          {tab === 'diff' && (
            <div className="box mono" style={{ fontSize: '.84rem', lineHeight: 1.7, whiteSpace: 'pre', overflowX: 'auto' }}>
              <div className="faint">src/calendar.ts</div>
              <div style={{ color: 'var(--ok)' }}>{'+ export const SLOT_MINUTES = 90;\n+ export function freeSlots(day: Date, taken: Slot[]): Slot[] {\n+   return allSlots(day, SLOT_MINUTES).filter((s) => !overlaps(s, taken));\n+ }'}</div>
            </div>
          )}
          {tab === 'tests' && (
            <div className="box">
              <div className="figures">
                <div><div className="figure__value" style={{ color: 'var(--ok)' }}>42</div><div className="figure__label">passés</div></div>
                <div><div className="figure__value">0</div><div className="figure__label">échec</div></div>
                <div><div className="figure__value">1,8 s</div><div className="figure__label">durée</div></div>
              </div>
              <p className="xsmall faint" style={{ marginTop: 12 }}>La sortie complète (312 lignes) est gardée dans le journal. L’agent n’a reçu que ce résumé.</p>
            </div>
          )}
        </div>

        {tab === 'conversation' && (
          <div className="composer">
            <div className="composer__box">
              <label className="sr-only" htmlFor="agent-input">Message à l’agent</label>
              <textarea id="agent-input" rows={1} value={text} placeholder={`Message à ${agent?.name ?? 'l’agent'}…`}
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <div className="composer__bar">
                <button className="btn btn--ghost btn--icon btn--sm" aria-label="Joindre un fichier" title="Joindre un fichier"><Paperclip size={16} /></button>
                <button className="btn btn--ghost btn--icon btn--sm" aria-label="Joindre une image" title="Joindre une image"><ImageIcon size={16} /></button>
                <span className="hint">Entrée pour envoyer</span>
                <button className="btn btn--primary btn--icon btn--sm" aria-label="Envoyer" onClick={send}><SendHorizontal size={15} /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className="tk__side" aria-label="Détails du ticket">
        <h4>Détails</h4>
        <div className="kv"><span>État</span><span>{agent ? <span className={`pill pill--dot pill--${paused ? '' : STATE[agent.state].tone}`}>{paused ? 'En pause' : STATE[agent.state].label}</span> : <span className="pill">{t.status === 'a-faire' ? 'À faire' : t.status === 'a-tester' ? 'À tester' : t.status === 'termine' ? 'Fini' : 'Sans agent'}</span>}</span></div>
        {agent && <div className="kv"><span>Agent</span><span>{agent.name}<span className="faint xsmall"> {role?.name}</span></span></div>}
        <div className="kv"><span>Outil</span><span>{TOOLS[conf.tool].label}</span></div>
        <div className="kv"><span>Compte</span><span>{account?.label}<span className="faint xsmall"> 5 h : {account?.quota5h} %</span></span></div>
        <div className="kv"><span>Modèle</span><span>{conf.model}, effort {conf.effort}</span></div>
        <div className="kv"><span>Budget</span><span><Bar value={t.used} max={t.budget} label="Budget" thick /><span className="xsmall muted num">{fmtTokens(t.used)} sur {fmtTokens(t.budget)}, boucle {t.loops}</span></span></div>
        {realizedState && <div className="kv"><span>Rapport</span><span>{t.reportedIn ? <span className="pill pill--ok">{t.reportedIn}</span> : <span className="pill pill--wait">à rapporter</span>}</span></div>}

        <h4>Dépend de</h4>
        {t.deps.length === 0 ? <p className="small faint">Aucun ticket.</p> : (
          <div className="row">{t.deps.map((d) => {
            const done = tickets.find((x) => x.id === d)?.status === 'termine';
            return <button key={d} className={`pill ${done ? 'pill--ok' : 'pill--wait'}`} onClick={() => go({ kind: 'ticket', ticketId: d })}>{d} {done ? <Check size={12} /> : 'en cours'}</button>;
          })}</div>
        )}

        <h4>Partie</h4>
        <p className="small">{t.part}, lot {t.lot}</p>

        {t.files.length > 0 && (<>
          <h4>Fichiers verrouillés</h4>
          {t.files.map((f) => <div key={f} className="lockfile"><Lock size={12} />{f}</div>)}
        </>)}

        <div className="tk__actions">
          {t.status === 'a-faire' && <button className="btn btn--primary" onClick={() => setLaunching(true)}><Play size={15} />Lancer maintenant</button>}
          {t.status === 'a-tester' && (<>
            <button className="btn btn--primary" onClick={() => validate(t.id)}><Check size={15} />Valider</button>
            <button className="btn" onClick={() => { setTab('realise'); setRejecting(true); }}><X size={15} />Ça ne marche pas</button>
          </>)}
          {t.status === 'en-cours' && (<>
            <button className="btn" onClick={() => { setPaused((v) => !v); notify(paused ? 'L’agent reprend là où il s’était arrêté.' : 'Agent en pause. Son travail est enregistré.'); }}>
              {paused ? <Play size={15} /> : <Pause size={15} />}{paused ? 'Reprendre' : 'Pause'}
            </button>
            <button className="btn" onClick={() => { const acc = accounts.find((a) => a.tool === other && a.connected)!; setConf({ tool: other, accountId: acc.id, model: TOOLS[other].models[1], effort: conf.effort }); notify(`Passera sur ${TOOLS[other].label} à la fin du tour, avec la passation.`); }}>
              <ArrowLeftRight size={15} />Passer à {TOOLS[other].short}
            </button>
            <button className="btn btn--danger" onClick={() => stop(t.id)}><Square size={14} />Arrêter</button>
            <button className="btn btn--ghost btn--sm" onClick={() => finish(t.id)}>Simuler la fin (démo du pilote)</button>
          </>)}
        </div>
      </aside>
      {launching && <LaunchDialog ticketId={t.id} onClose={() => setLaunching(false)} />}
    </div>
  );
}
