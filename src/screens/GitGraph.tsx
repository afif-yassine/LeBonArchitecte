// Git en schéma (point 3) : main et les branches des tickets, les réunions, les annulations,
// les changements pas encore enregistrés. Cliquer un point : son détail, « Repartir d'ici »
// (nouvelle branche, main jamais touché) ou, pour une réunion, « Annuler ce ticket dans main » (git revert).
import { useMemo, useState } from 'react';
import { GitBranch, GitMerge, RotateCcw, Undo2 } from 'lucide-react';
import { useNotify } from '../components/notify';
import { useStore } from '../store';
import { useApi } from './RealSpaces';
import type { Go } from '../view';
import '../git.css'; // styles de cet écran seulement

interface Node { hash: string; short: string; parents: string[]; subject: string; at: string; lane: number; ticket?: string; kind: 'main' | 'branche' | 'reunion' | 'annulation' }
interface Graph { nodes: Node[]; lanes: { lane: number; ticket: string; branch: string; merged: boolean; worktree: boolean }[]; dirty: string[]; head: string; branch: string }
interface Info { branch: string; remote: string; ahead: number; behind: number }
interface Commit { body: string; files: { path: string; plus: number; minus: number }[] }

const ROW = 44;
const GAP = 24;
const PAD = 18;
const xOf = (lane: number) => PAD + lane * GAP;
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const KIND: Record<Node['kind'], string> = { main: 'main', branche: 'branche du ticket', reunion: 'réunion dans main', annulation: 'annulation' };

function Detail({ projectId, node, onClose, go }: { projectId: string; node: Node; onClose: () => void; go: Go }) {
  const notify = useNotify();
  const { data } = useApi<Commit>(`/projects/${projectId}/commit?hash=${node.hash}`);
  const [confirm, setConfirm] = useState<'branche' | 'annuler' | null>(null);
  const [busy, setBusy] = useState(false);
  const post = async (path: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/git/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hash: node.hash }) });
      notify(((await r.json()) as { message?: string }).message ?? 'Fait.');
    } finally { setBusy(false); setConfirm(null); }
  };
  const body = data?.body.split('\n').slice(1).join('\n').replace(/Co-Authored-By:.*$/gm, '').trim();
  return (
    <aside className="gd" aria-label={`Détail du commit ${node.short}`}>
      <div className="gd__head">
        <span className={`gd__kind is-${node.kind}`}>{KIND[node.kind]}</span>
        <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Fermer le détail">Fermer</button>
      </div>
      <h3 className="gd__title">{node.subject}</h3>
      <p className="gd__meta"><code>{node.short}</code> <span>{when(node.at)}</span>
        {node.ticket && <button className="tchip" onClick={() => go({ kind: 'ticket', ticketId: node.ticket! })}>{node.ticket}</button>}</p>
      {body && <p className="gd__body">{body}</p>}
      <h4 className="gd__h">Fichiers {data ? <span className="faint">{data.files.length}</span> : null}</h4>
      {!data ? <p className="faint small">Lecture…</p> : (
        <ul className="gd__files">
          {data.files.map((f) => <li key={f.path}><span className="mono">{f.path}</span><span className="diffstat"><span className="plus">+{f.plus}</span><span className="minus">−{f.minus}</span></span></li>)}
        </ul>
      )}
      <div className="gd__acts">
        {confirm === 'branche' ? (
          <div className="gd__confirm">
            <p>Créer la branche <b>reprise/{node.short}</b> à partir de ce point ? main ne change pas, rien n’est effacé.</p>
            <div className="row"><button className="btn btn--primary btn--sm" disabled={busy} onClick={() => post('branch')}>Créer la branche</button><button className="btn btn--ghost btn--sm" onClick={() => setConfirm(null)}>Annuler</button></div>
          </div>
        ) : confirm === 'annuler' ? (
          <div className="gd__confirm is-danger">
            <p>Annuler {node.ticket ?? 'ce ticket'} dans main ? Un commit d’annulation est ajouté : l’historique est gardé et le travail reste dans sa branche. Les tests sont relancés ensuite.</p>
            <div className="row"><button className="btn btn--sm gd__danger" disabled={busy} onClick={() => post('revert')}>Annuler {node.ticket ?? 'la réunion'} dans main</button><button className="btn btn--ghost btn--sm" onClick={() => setConfirm(null)}>Garder</button></div>
          </div>
        ) : (
          <>
            <button className="btn btn--sm" onClick={() => setConfirm('branche')}><RotateCcw size={14} /> Repartir d’ici</button>
            {node.kind === 'reunion' && <button className="btn btn--sm" onClick={() => setConfirm('annuler')}><Undo2 size={14} /> Annuler ce ticket dans main</button>}
          </>
        )}
      </div>
    </aside>
  );
}

export function GitGraphScreen({ projectId, go }: { projectId: string; go: Go }) {
  const { data: g, error } = useApi<Graph>(`/projects/${projectId}/graph`);
  const { data: info } = useApi<Info>(`/projects/${projectId}/git`);
  const { tickets } = useStore();
  const [sel, setSel] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (!g) return null;
    const top = g.dirty.length ? 1 : 0;
    const idx = new Map(g.nodes.map((n, i) => [n.hash, i + top]));
    const yOf = (row: number) => row * ROW + ROW / 2;
    const maxLane = Math.max(0, ...g.nodes.map((n) => n.lane));
    const paths: { d: string; lane: number }[] = [];
    g.nodes.forEach((n, i) => {
      const y1 = yOf(i + top);
      const x1 = xOf(n.lane);
      n.parents.forEach((p) => {
        const j = idx.get(p);
        const pl = j === undefined ? n.lane : g.nodes[j - top].lane;
        const x2 = xOf(pl);
        const y2 = j === undefined ? (g.nodes.length + top) * ROW : yOf(j);
        if (x1 === x2) paths.push({ d: `M${x1} ${y1} L${x2} ${y2}`, lane: n.lane });
        else if (n.lane > pl) paths.push({ d: `M${x1} ${y1} L${x1} ${y2 - ROW / 2} Q${x1} ${y2} ${x2} ${y2}`, lane: n.lane }); // départ de la branche
        else paths.push({ d: `M${x1} ${y1} Q${x2} ${y1} ${x2} ${y1 + ROW / 2} L${x2} ${y2}`, lane: pl }); // réunion dans main
      });
    });
    return { top, yOf, width: xOf(maxLane) + PAD, height: (g.nodes.length + top) * ROW, paths };
  }, [g]);

  const node = g?.nodes.find((n) => n.hash === sel);
  const title = (id?: string) => tickets.find((t) => t.id === id)?.title;

  return (
    <div className="page page--lib">
      <h1>Git</h1>
      {info && (
        <p className="lead">
          Branche <b>{info.branch}</b>{info.remote && <> · GitHub : {info.remote.replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '')}</>}.{' '}
          {info.ahead > 0 ? <span className="pill pill--wait">{info.ahead} commit{info.ahead > 1 ? 's' : ''} pas encore envoyé{info.ahead > 1 ? 's' : ''}</span> : <span className="pill pill--ok">À jour avec GitHub</span>}
        </p>
      )}
      {!g || !layout ? <p className={error ? '' : 'faint'}>{error ?? 'Lecture de l’historique…'}</p> : (
        <>
          <ul className="gl" aria-label="Branches">
            <li><span className="gl__dot lane-0" /> main <span className="faint">travail validé et testé</span></li>
            {g.lanes.map((l) => (
              <li key={l.branch}>
                <span className={`gl__dot lane-${((l.lane - 1) % 4) + 1}`} />
                <button className="gl__t" onClick={() => go({ kind: 'ticket', ticketId: l.ticket })}>{l.ticket}</button>
                <span className="faint">{l.merged ? 'réuni dans main' : l.worktree ? 'en travail, pas encore réuni' : 'pas réuni'}</span>
              </li>
            ))}
          </ul>
          <div className={`gg ${node ? 'has-detail' : ''}`}>
            <div className="gg__scroll">
              <div className="gg__graph" style={{ height: layout.height }}>
                <svg className="gg__svg" width={layout.width} height={layout.height} aria-hidden="true">
                  {layout.paths.map((p, i) => <path key={i} d={p.d} className={`gg__line lane-${p.lane ? ((p.lane - 1) % 4) + 1 : 0}`} />)}
                  {layout.top === 1 && <circle cx={xOf(0)} cy={layout.yOf(0)} r={6} className="gg__dirty" />}
                  {g.nodes.map((n, i) => (
                    <circle key={n.hash} cx={xOf(n.lane)} cy={layout.yOf(i + layout.top)} r={n.kind === 'reunion' ? 6.5 : 5}
                      className={`gg__dot lane-${n.lane ? ((n.lane - 1) % 4) + 1 : 0} is-${n.kind} ${sel === n.hash ? 'is-sel' : ''}`} />
                  ))}
                </svg>
                <ol className="gg__rows" style={{ paddingLeft: layout.width + 6 }}>
                  {layout.top === 1 && (
                    <li className="gg__row is-dirty" title={g.dirty.join('\n')}>
                      <span className="gg__subj">Changements pas encore enregistrés <span className="faint">{g.dirty.length} fichier{g.dirty.length > 1 ? 's' : ''}</span></span>
                    </li>
                  )}
                  {g.nodes.map((n) => (
                    <li key={n.hash}>
                      <button className={`gg__row ${sel === n.hash ? 'is-sel' : ''}`} onClick={() => setSel(sel === n.hash ? null : n.hash)} aria-pressed={sel === n.hash}>
                        {n.kind === 'reunion' ? <GitMerge size={13} className="gg__ico" aria-hidden="true" /> : n.kind === 'branche' ? <GitBranch size={13} className="gg__ico" aria-hidden="true" /> : n.kind === 'annulation' ? <Undo2 size={13} className="gg__ico is-danger" aria-hidden="true" /> : null}
                        <span className="gg__subj">{n.subject}</span>
                        {n.ticket && <span className="gg__tk" title={title(n.ticket)}>{n.ticket}</span>}
                        <code className="gg__hash">{n.short}</code>
                        <span className="gg__at">{when(n.at)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            {node && <Detail key={node.hash} projectId={projectId} node={node} onClose={() => setSel(null)} go={go} />}
          </div>
          <p className="xsmall faint" style={{ marginTop: 10 }}>Cliquez un point pour voir ce qu’il a changé. « Repartir d’ici » crée une nouvelle branche sans toucher à main. Annuler un ticket ajoute un commit d’annulation : rien n’est jamais effacé.</p>
        </>
      )}
    </div>
  );
}
