import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronDown,
  Info, Lock, SendHorizontal, Settings2, X,
} from 'lucide-react';
import { accounts, projects, requirements } from '../mock/data';
import { TOOLS, budgetFor, type Effort, type LiveItem, type Ticket, type ToolId } from '../shared/contract';
import '../ticket-side.css';
import { Deroule, PhaseFrise } from '../components/Deroule';
import { TicketStatus } from '../components/TicketStatus';
import { FileViewer } from '../components/FileViewer';
import { TestsTab } from '../components/TestsTab';
import { ReportTab } from '../components/ReportTab';
import { Tabs, fmtTokens } from '../components/ui';
import { LaunchDialog } from '../components/LaunchDialog';
import { useNotify } from '../components/notify';
import { useStore } from '../store';
import { useApi } from './RealSpaces';
import type { Go } from '../view';

// Effort réel donné à l'agent (même règle que server/claude.ts : Opus = haut, Haiku = bas).
const effortOf = (t: Ticket) => (t.model === 'Haiku' || t.effort === 'bas' ? 'bas' : t.effort === 'haut' || t.model === 'Opus' ? 'haut' : 'moyen');

// Contexte de l'agent : ce qu'il avait en tête, lu dans le journal de sa session (aucun token).
interface Ctx { exists: boolean; kept: boolean; series: number[]; start: number; end: number; peak: number; read: string[]; memory: string[]; compactions: number; reloads?: number; reloadTokens?: number }
function ContextCard({ id, running }: { id: string; running: boolean }) {
  const { data } = useApi<Ctx>(`/tickets/${id}/context`);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  if (!data.exists) return (
    <section className="sd-card"><h4 className="sd-label">Contexte de l’agent</h4><p className="sd-line">Pas encore de conversation : elle commence au lancement.</p></section>
  );
  const max = Math.max(1, ...data.series);
  const pts = data.series.map((v, i) => `${(i / Math.max(1, data.series.length - 1)) * 100},${28 - (v / max) * 26}`).join(' ');
  return (
    <section className="sd-card">
      <h4 className="sd-label">Contexte de l’agent</h4>
      <div className="sd-ctx">
        <span><span className="num">{fmtTokens(data.start)}</span> au départ</span>
        <span className="sd-ctx__arrow" aria-hidden="true">→</span>
        <span><span className="num">{fmtTokens(data.end)}</span> {running ? 'maintenant' : 'à la fin'}</span>
      </div>
      {data.series.length > 1 && (
        <svg className="sd-spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={`Taille du contexte à chaque échange, de ${fmtTokens(data.start)} à ${fmtTokens(data.end)}, au plus ${fmtTokens(data.peak)}`}>
          <polyline points={`0,30 ${pts} 100,30`} className="sd-spark__area" />
          <polyline points={pts} className="sd-spark__line" />
        </svg>
      )}
      {!!data.reloads && (
        <p className="sd-line sd-line--warn" title="Après plus de 5 minutes sans échange, le cache expire : reprendre la conversation la réécrit en entier, au plein tarif.">
          Rechargée {data.reloads} fois après une pause : {fmtTokens(data.reloadTokens ?? 0)} payés pour rien.
        </p>
      )}
      <p className="sd-line">{data.compactions ? `Compacté ${data.compactions} fois. ` : ''}Conversation {data.kept ? 'gardée : il peut reprendre où il en était.' : 'non gardée.'}</p>
      <button className="sd-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {data.read.length} fichier{data.read.length > 1 ? 's' : ''} du projet lu{data.read.length > 1 ? 's' : ''}{data.memory.length ? `, ${data.memory.length} de mémoire` : ''} {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul className="sd-files">
          {data.memory.map((f) => <li key={`m${f}`} className="is-mem" title="Mémoire et règles du propriétaire">{f}</li>)}
          {data.read.map((f) => <li key={f} title={f}>{f}</li>)}
        </ul>
      )}
    </section>
  );
}

type Tab = 'deroule' | 'description' | 'realise' | 'journal' | 'diff' | 'tests';
interface RawEvent { id: number; at: string; type: string; actor: string; data: Record<string, unknown> }
const EV_LABEL: Record<string, string> = {
  'ticket-cree': 'Ticket créé', 'ticket-lance': 'Lancé', 'ticket-arrete': 'Arrêté', 'agent-termine': 'Fin de l’agent', 'ticket-a-tester': 'Passé à tester',
  'besoin-action': 'Besoin d’action', 'ticket-valide': 'Validé', reclamation: 'Réclamation', reparation: 'Réparation automatique', rapporte: 'Rapporté', 'plan-valide': 'Plan validé',
  'etape-commencee': 'Étape commencée', 'etape-annoncee': 'Étape annoncée', direct: 'Direct',
  'ticket-interrompu': 'Interrompu', 'ticket-repris': 'Repris', reuni: 'Travail enregistré', tokens: 'Tokens comptés', activite: 'Activité',
  'ticket-pause': 'Mis en pause', 'etape-prouvee': 'Étape prouvée',
};
// Le direct est déjà dans le Déroulé : caché par défaut dans le journal brut, pour qu'on y lise les vrais événements.
const NOISY = new Set(['direct', 'tokens', 'activite']);
const actorOf = (a: string) => (a === 'vous' ? 'vous' : a === 'programme' ? 'programme' : a.startsWith('claude') || a.startsWith('codex') ? 'agent' : a);
const evText = (d: Record<string, unknown>) => String(d.text ?? d.cause ?? d.problem ?? d.evidence ?? d.model ?? d.report ?? d.step ?? '');

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

export function TicketView({ ticketId, go }: { ticketId: string; go: Go }) {
  const notify = useNotify();
  const { tickets, simulate, validatePlan, sendMessage, runCommand, live, rev, validate, reject, pause, resume, fix, isReady } = useStore();
  const [rejecting, setRejecting] = useState(false);
  // Valider dure (tests, réunion, tests dans main) : le bouton se bloque et le bandeau montre chaque étape.
  const [busy, setBusy] = useState(false);
  const doValidate = () => { if (busy) return; setBusy(true); validate(ticketId).finally(() => setBusy(false)); };
  const [problem, setProblem] = useState('');
  const t = tickets.find((x) => x.id === ticketId)!;
  const [tab, setTab] = useState<Tab>(t.status === 'a-tester' ? 'realise' : 'deroule');
  const [showNoisy, setShowNoisy] = useState(false);
  const [conf, setConf] = useState({ tool: t.tool, accountId: t.accountId, model: t.model, effort: t.effort });
  const [menu, setMenu] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [feed, setFeed] = useState<LiveItem[] | null>(null); // null = pas encore lu
  const [journal, setJournal] = useState<RawEvent[]>([]);
  const [text, setText] = useState('');
  const demo = Boolean(projects.find((p) => p.id === t.projectId)?.demo);

  // Le moteur prévient à chaque changement (rev) : on relit le direct et le journal du ticket.
  useEffect(() => {
    let off = false;
    live(t.id).then((l) => { if (!off) setFeed(l); });
    if (tab === 'journal') fetch(`/api/tickets/${t.id}/events`).then((r) => r.json()).then((j: RawEvent[]) => { if (!off) setJournal(j); }).catch(() => {});
    return () => { off = true; };
  }, [t.id, rev, tab, live]);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    // « !commande » : le moteur l'exécute (interdits refusés), l'agent n'en reçoit que le résumé.
    if (v.startsWith('!')) runCommand(t.id, v.slice(1).trim()); else sendMessage(t.id, v);
    setText('');
  };

  return (
    <div className="tk">
      <div className="tk__main">
        <div className="tk__head">
          <button className="btn btn--ghost btn--sm" onClick={() => go({ kind: 'projet', projectId: t.projectId, space: 'travail' })}><ArrowLeft size={15} />Travail</button>
          <div className="tk__title"><span className="card__id">{t.id}</span>{t.title}</div>
          {/* Changer d'outil en cours de route n'est pas encore branché au moteur : seulement sur les projets d'exemple. */}
          {demo && <div style={{ marginLeft: 'auto', position: 'relative', flex: 'none' }}>
            <button className="btn btn--sm" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <Settings2 size={14} />Outil et modèle<ChevronDown size={14} />
            </button>
            {menu && (
              <ToolMenu tool0={conf.tool} account0={conf.accountId} model0={conf.model} effort0={conf.effort} onClose={() => setMenu(false)}
                onApply={(v) => { setConf(v); setMenu(false); notify(`Passera sur ${TOOLS[v.tool].label}, ${v.model}, à la fin du tour. Même dossier, même branche.`); }} />
            )}
          </div>}
        </div>
        <TicketStatus t={t} busy={busy} ready={isReady(t)}
          onValidate={doValidate} onReject={() => { setTab('realise'); setRejecting(true); }} onFix={() => { fix(t.id); }}
          onPause={() => pause(t.id)} onResume={() => resume(t.id)} onLaunch={() => setLaunching(true)} onLook={() => setTab('deroule')} />
        <div className="tk__phases"><PhaseFrise t={t} /></div>
        <div className="tk__tabs">
          {/* 5 onglets : Description et Journal brut sont sous « Plus ». */}
          <Tabs<Tab> label="Vues du ticket" value={tab === 'journal' ? 'description' : tab} onChange={setTab} tabs={[
            { id: 'deroule', label: 'Déroulé' }, { id: 'realise', label: 'Compte rendu' }, { id: 'tests', label: 'Tests' },
            { id: 'diff', label: 'Changements' }, { id: 'description', label: 'Plus' },
          ]} />
        </div>

        <div className="tk__body">
          {(tab === 'description' || tab === 'journal') && (
            <div className="tk-more" role="group" aria-label="Plus">
              <button className={tab === 'description' ? 'is-on' : ''} aria-pressed={tab === 'description'} onClick={() => setTab('description')}>Description</button>
              <button className={tab === 'journal' ? 'is-on' : ''} aria-pressed={tab === 'journal'} onClick={() => setTab('journal')}>Journal brut</button>
            </div>
          )}
          {tab === 'deroule' && <Deroule t={t} feed={feed ?? []} loading={feed === null} demo={demo} onValidatePlan={() => validatePlan(t.id)} onSimulate={() => simulate(t.id)} />}
          {tab === 'description' && (
            <div className="descr descr--grid">
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
                    <li key={d.label} className={`check ${d.state === 'ok' ? 'is-ok' : d.state === 'echec' ? 'is-fail' : d.state === 'non-verifie' ? 'is-unknown' : ''}`}
                      title={d.state === 'non-verifie' ? 'Aucun outil ne l’a contrôlé : à regarder à la recette.' : undefined}>
                      <span className="check__mark" aria-hidden="true">{d.state === 'ok' ? <Check size={11} strokeWidth={3.5} /> : d.state === 'echec' ? <X size={11} strokeWidth={3.5} /> : d.state === 'non-verifie' ? '?' : null}</span>
                      <span>{d.label}{d.state === 'non-verifie' && <span className="faint xsmall"> : non vérifié</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'realise' && (
              <div className="descr">
                {/* Valider est dans le bandeau du haut ; ici seulement la description de ce qui ne va pas, quand on l'ouvre. */}
                {t.status === 'a-tester' && rejecting && (
                  <div className="recette">
                    <h3>Qu’est-ce qui ne va pas ?</h3>
                    <p className="small muted">L’agent qui a fait le travail reprend sa conversation avec votre description, corrige et repasse les tests.</p>
                    {rejecting && (
                      <div className="recette__ko">
                        <label className="sr-only" htmlFor="ko">Ce qui ne marche pas</label>
                        <textarea id="ko" className="input" rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Ex. : le lien de connexion arrive, mais la page reste blanche sur mobile." />
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn--ghost btn--sm" onClick={() => setRejecting(false)}>Annuler</button>
                          <button className="btn btn--primary btn--sm" disabled={!problem.trim()} onClick={() => { reject(t.id, problem.trim()); setRejecting(false); setProblem(''); }}>Renvoyer à l’agent</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <ReportTab ticketId={t.id} onDocs={() => go({ kind: 'projet', projectId: t.projectId, space: 'docs' })} onTests={() => setTab('tests')}
                  files={!t.realized ? null : <>
                    <ul className="files">{t.realized.files.map((f) => <li key={f.path}><span className="mono">{f.path}</span><span className="diffstat"><span className="plus">+{f.plus}</span><span className="minus">−{f.minus}</span></span></li>)}</ul>
                    <button className="link cr-more" onClick={() => setTab('diff')}>Voir les changements ligne par ligne</button>
                  </>} />
              </div>
          )}

          {tab === 'journal' && (() => {
            const hidden = journal.filter((e) => NOISY.has(e.type)).length;
            const shown = showNoisy ? journal : journal.filter((e) => !NOISY.has(e.type));
            let lastDay = '';
            return (
              <div className="jr">
                <p className="jr__intro">
                  Chaque événement écrit par le moteur, tel quel, pour l’audit.
                  {hidden > 0 && <label className="jr__toggle"><input type="checkbox" checked={showNoisy} onChange={(e) => setShowNoisy(e.target.checked)} /> Afficher aussi le direct et les compteurs ({hidden})</label>}
                </p>
                {shown.length === 0 ? <p className="cr-missing">Aucun événement pour l’instant.</p> : (
                  <ol className="jr__list">
                    {shown.map((e) => {
                      const d = new Date(e.at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
                      const head = d !== lastDay; lastDay = d;
                      return (
                        <li key={e.id}>
                          {head && <h4 className="jr__day">{d}</h4>}
                          <div className={`jr__ev is-${actorOf(e.actor)}`}>
                            <span className="jr__time">{new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="jr__who">{actorOf(e.actor)}</span>
                            <span className="jr__what"><b>{EV_LABEL[e.type] ?? e.type}</b> {evText(e.data)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })()}
          {/* Avant : des exemples écrits en dur. Maintenant : les vrais changements et les vrais tests du ticket. */}
          {tab === 'diff' && (
            !t.realized || t.realized.files.length === 0
              ? <div className="empty"><h3>Aucun changement pour l’instant</h3><p>Les fichiers modifiés par l’agent s’affichent ici, avec leurs lignes ajoutées et retirées.</p></div>
              : demo
                ? <ul className="files">{t.realized.files.map((f) => <li key={f.path}><span className="mono">{f.path}</span><span className="diffstat"><span className="plus">+{f.plus}</span><span className="minus">−{f.minus}</span></span></li>)}</ul>
                : <FileViewer ticketId={t.id} files={t.realized.files} />
          )}
          {tab === 'tests' && <TestsTab feed={feed ?? []} />}
        </div>

        {tab === 'deroule' && t.status !== 'termine' && (
          <div className="composer">
            <div className="composer__box">
              <label className="sr-only" htmlFor="agent-input">Message à l’agent</label>
              <textarea id="agent-input" rows={1} value={text} placeholder={
                t.status === 'a-tester' || t.status === 'action' ? 'Demander une modification à l’agent qui a fait le travail : il reprend sa conversation…'
                : t.status === 'en-cours' ? 'Message à l’agent : il le reçoit à la fin de son tour, dans sa conversation…'
                : 'Message pour l’agent : il le recevra à son lancement…'}
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <div className="composer__bar">
                <span className="hint">Entrée pour envoyer. « !npm test » lance une commande par le moteur.</span>
                <button className="btn btn--primary btn--icon btn--sm" aria-label="Envoyer" onClick={send}><SendHorizontal size={15} /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Panneau de droite : qui travaille, ce que ça consomme, à quoi le ticket est relié.
          Les actions sont dans le bandeau d'état, en haut : pas de doublon ici. Seulement des chiffres vrais. */}
      <aside className="tk__side sd" aria-label="Détails du ticket">
        <section className="sd-card">
          <h4 className="sd-label">Qui travaille</h4>
          <div className="sd-model">
            <span className="sd-model__name">{t.model}</span>
            <span className="sd-chip">effort {effortOf(t)}</span>
          </div>
          <p className="sd-line">{TOOLS[t.tool]?.label ?? t.tool}{!demo && ', sur votre abonnement'}</p>
          <p className="sd-line">{t.loops > 1 ? `${t.loops} passages de l’agent` : t.status === 'a-faire' ? 'Pas encore lancé' : '1 passage de l’agent'}{t.usage?.turns ? ` · ${t.usage.turns} échanges` : ''}</p>
          {t.interrupted && <p className="sd-line sd-line--warn">Dernière étape prouvée : {t.interrupted.lastProved ?? 'aucune'}</p>}
        </section>

        {!demo && <ContextCard id={t.id} running={t.status === 'en-cours'} />}

        <section className="sd-card">
          <h4 className="sd-label">Consommation</h4>
          {(() => {
            const ref = budgetFor(t);
            const ratio = t.used / ref;
            const tone = ratio > 1 ? 'danger' : ratio > .8 ? 'wait' : 'ok';
            const u = t.usage;
            return t.used === 0 ? <p className="sd-line">Rien de consommé pour l’instant. Prévu : environ {fmtTokens(ref)} tokens pour {t.model}.</p> : (<>
              <div className="sd-big"><span className="num">{fmtTokens(t.used)}</span> tokens{u && u.costUsd > 0 && <span className="sd-cost">≈ {u.costUsd.toFixed(2)} $ d’équivalent</span>}</div>
              <div className={`sd-meter is-${tone}`} role="meter" aria-valuemin={0} aria-valuemax={ref} aria-valuenow={t.used} aria-label="Tokens utilisés par rapport au prévu">
                <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
              </div>
              <p className="sd-line">{ratio > 1 ? `Au-dessus du prévu (environ ${fmtTokens(ref)} pour ${t.model}).` : `Dans le prévu : environ ${fmtTokens(ref)} pour ${t.model}.`}</p>
              {u && (
                <dl className="sd-split">
                  {u.split && <><dt>Entrée</dt><dd className="num">{fmtTokens(u.input)}</dd><dt>Sortie</dt><dd className="num">{fmtTokens(u.output)}</dd><dt>Cache écrit</dt><dd className="num">{fmtTokens(u.cacheWrite)}</dd></>}
                  <dt>Relu du cache</dt><dd className="num">{fmtTokens(u.cacheRead)}</dd>
                </dl>
              )}
              {u && !u.split && <p className="sd-note">L’entrée et la sortie sont séparées à partir des prochains passages de l’agent.</p>}
              <p className="sd-note">Le cache relu n’est pas compté dans le total : il coûte environ 10 fois moins.</p>
            </>);
          })()}
        </section>

        <section className="sd-card">
          <h4 className="sd-label">Relié à</h4>
          <dl className="sd-links">
            <dt>Partie</dt><dd>{t.part}, lot {t.lot}</dd>
            <dt>Dépend de</dt>
            <dd>{t.deps.length === 0 ? <span className="faint">aucun ticket</span> : <span className="sd-chips">{t.deps.map((d) => {
              const done = tickets.find((x) => x.id === d)?.status === 'termine';
              return <button key={d} className={`sd-tk ${done ? 'is-ok' : ''}`} onClick={() => go({ kind: 'ticket', ticketId: d })}>{d}{done && <Check size={11} strokeWidth={3} />}</button>;
            })}</span>}</dd>
            {t.description.cdcRefs.length > 0 && (<><dt>Exigences</dt><dd className="sd-chips">{t.description.cdcRefs.map((r) => <button key={r} className="sd-tk" onClick={() => go({ kind: 'projet', projectId: t.projectId, space: 'cdc' })}>{r}</button>)}</dd></>)}
          </dl>
          {t.files.length > 0 && (<>
            <h4 className="sd-label" style={{ marginTop: 14 }}>Fichiers réservés</h4>
            {t.files.map((f) => <div key={f} className="lockfile"><Lock size={12} />{f}</div>)}
          </>)}
        </section>
        {demo && t.status === 'en-cours' && <button className="btn btn--ghost btn--sm" onClick={() => simulate(t.id)}>Simuler un déroulé (démo)</button>}
      </aside>
      {launching && <LaunchDialog ticketId={t.id} onClose={() => setLaunching(false)} />}
    </div>
  );
}
