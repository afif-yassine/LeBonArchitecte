// Écran Architecte (vrai projet, décision 0014, lot C) : vous lui parlez comme à Claude Code.
// Il agit seul sur le projet avec la commande lba ; chaque action s'affiche sur une ligne ; chaque réponse
// montre son modèle, ses tokens, la taille de sa conversation et sa durée, et sort en PDF.
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { ArrowUp, FileText, Loader2, Paperclip, Wrench, X } from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { fmtTokens } from '../components/ui';
import { useNotify } from '../components/notify';
import { ARCHITECT_COST, ARCHITECT_MODELS, pickArchitectModel } from '../shared/architect';
import { ARCHITECT_COMMANDS, parseCommand } from '../shared/commands';
import { useApi } from './RealSpaces';
import type { Go } from '../view';
import '../architect.css';

interface Piece { file: string; name: string; kind: 'image' | 'pdf' | 'texte'; size: number; tokens: number; detail: string }
interface Msg { id: number; at: string; who: 'vous' | 'architecte' | 'action' | 'systeme'; text: string; model?: string; compte?: string; tokens?: number; cacheRead?: number; context?: number; ms?: number; ok?: boolean; detail?: string; commande?: boolean; btw?: boolean; pieces?: Piece[] }
interface ArchitectData { busy: boolean; btw: boolean; thread: Msg[]; model: 'Opus' | 'Sonnet' | 'Haiku' | null; compte: string | null; compteAuto: string; comptes: { id: string; name: string; five?: number }[] }

const MAX_PIECES = 8;
const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.json,.log,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.sql,.sh,.ps1';
const asBase64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
const pct = (v?: number) => (v === undefined ? '' : ` · 5 h ${Math.round(v * 100)} %`);

const SUGGEST = [
  'Où en est le projet, et que ferais-tu ensuite ?',
  'Quel ticket faut-il lancer en premier, et pourquoi ?',
  'Fais une revue de l’architecture et des risques.',
];
const hour = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function ArchitectLive({ projectId, go, ask }: { projectId: string; go: Go; ask?: string }) {
  const notify = useNotify();
  const { data } = useApi<ArchitectData>(`/projects/${projectId}/architecte`);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(Date.now());
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);
  const thread = data?.thread ?? [];
  const working = Boolean(data?.busy); // l'Architecte travaille : seules les commandes et /btw partent
  const busy = working || sending;

  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [thread.length, busy]);
  useEffect(() => { input.current?.focus(); }, []);
  // Chrono pendant qu'il travaille.
  useEffect(() => { if (!busy) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [busy]);

  const post = (path: string, body: unknown) => fetch(`/api/projects/${projectId}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const send = async (raw: string) => {
    const t = raw.trim();
    const isCmd = t.startsWith('/') && !/^\/(opus|sonnet|haiku)\b/i.test(t);
    if ((!t && !pieces.length) || sending || uploading) return;
    if (working && !isCmd) { notify('L’Architecte travaille sur votre demande précédente. Attendez sa réponse, ou posez une question en passant avec /btw.'); return; }
    const sent = isCmd ? [] : pieces;
    setSending(true); setText(''); if (!isCmd) setPieces([]);
    try {
      const r = await post('/architecte', { text: t, ...(sent.length ? { pieces: sent.map((p) => p.file) } : {}) });
      const j = await r.json();
      if (!r.ok) { notify(j.message ?? 'Refusé.'); setText(t); if (sent.length) setPieces(sent); }
    } catch { notify('Le moteur est arrêté : lancez « npm run dev ».'); setText(t); if (sent.length) setPieces(sent); }
    finally { setSending(false); }
  };

  // Pièces jointes (lot C2) : envoyées tout de suite au moteur, qui renvoie leur coût estimé.
  const attach = async (files: FileList | File[]) => {
    const list = [...files].slice(0, Math.max(0, MAX_PIECES - pieces.length));
    if (files.length > list.length) notify(`${MAX_PIECES} pièces au plus par message.`);
    for (const f of list) {
      if (f.size > 10_000_000) { notify(`« ${f.name} » fait plus de 10 Mo.`); continue; }
      setUploading((n) => n + 1);
      try {
        const r = await post('/pieces', { name: f.name || 'image-collee.png', data: await asBase64(f) });
        const j = await r.json();
        if (r.ok) setPieces((ps) => [...ps, j as Piece]); else notify(j.message ?? 'Refusé.');
      } catch { notify('Le moteur est arrêté : lancez « npm run dev ».'); }
      finally { setUploading((n) => n - 1); }
    }
    input.current?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files];
    if (files.length) { e.preventDefault(); void attach(files); }
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void attach(e.dataTransfer.files); };
  const setting = async (body: { model?: string; compte?: string }) => {
    const r = await post('/architecte/reglages', body).catch(() => undefined);
    if (!r) { notify('Le moteur est arrêté : lancez « npm run dev ».'); return; }
    if (!r.ok) notify((await r.json()).message ?? 'Refusé.');
  };
  // La barre « Écrire à l'Architecte… » du bas de chaque page arrive ici avec la demande.
  useEffect(() => { if (ask && !asked.current) { asked.current = true; void send(ask); } }, [ask]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commandes proposées pendant qu'on tape « /… » (avant l'espace) ; Tab complète la première.
  const typing = /^\/[\p{L}]*$/u.test(text) ? text.slice(1).toLowerCase() : null;
  const matches = typing === null ? [] : ARCHITECT_COMMANDS.filter((c) => c.name.startsWith(typing));
  const complete = (name: string) => { setText(`/${name} `); input.current?.focus(); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && matches.length) { e.preventDefault(); complete(matches[0].name); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); }
  };
  const fixed = data?.model ?? undefined;
  const model = pickArchitectModel(text, fixed);
  const cmd = parseCommand(text);
  const lastAsk = [...thread].reverse().find((m) => m.who === 'vous' && !m.btw && !m.commande);
  const piecesTokens = pieces.reduce((n, p) => n + p.tokens, 0);
  const pieceUrl = (p: Piece) => `/api/projects/${projectId}/pieces/${encodeURIComponent(p.file)}`;
  const PieceList = ({ list, remove }: { list: Piece[]; remove?: (p: Piece) => void }) => (
    <ul className="ar__pieces">
      {list.map((p) => (
        <li key={p.file} className={`ar__piece is-${p.kind}`}>
          {p.kind === 'image'
            ? <a href={pieceUrl(p)} target="_blank" rel="noopener"><img src={pieceUrl(p)} alt={p.name} loading="lazy" /></a>
            : <a href={pieceUrl(p)} target="_blank" rel="noopener" className="ar__pieceicon"><FileText size={16} aria-hidden="true" />{p.kind === 'pdf' ? 'PDF' : 'Texte'}</a>}
          <span className="ar__piecename" title={`${p.name}, ${p.detail}`}>{p.name}</span>
          <span className="ar__piecetok">≈ {fmtTokens(p.tokens)}</span>
          {remove && <button type="button" className="ar__pieceoff" aria-label={`Retirer ${p.name}`} onClick={() => remove(p)}><X size={12} /></button>}
        </li>
      ))}
    </ul>
  );
  const elapsed = busy && lastAsk ? Math.max(0, Math.round((now - Date.parse(lastAsk.at)) / 1000)) : 0;
  const today = thread.filter((m) => m.who === 'architecte' && !m.commande && new Date(m.at).toDateString() === new Date().toDateString());
  const spent = today.reduce((n, m) => n + (m.tokens ?? 0), 0);

  return (
    <div className="ar">
      <header className="ar__head">
        <div>
          <h1 className="ar__title">Architecte</h1>
          <p className="ar__sub">Il tient le projet : kanban, agents, documents. Il vous dit son avis avant une grosse décision. Valider, git, budget et supprimer restent à vous.</p>
        </div>
        <p className="ar__today"><b>{today.length}</b> réponse{today.length > 1 ? 's' : ''} aujourd’hui<span aria-hidden="true">,</span> <b>{fmtTokens(spent)}</b> tokens</p>
      </header>

      <div className="ar__fil" ref={scroll} aria-live="polite">
        {thread.length === 0 && (
          <div className="ar__empty">
            <p>Demandez-lui ce que vous voulez sur le projet. Une petite consigne est faite tout de suite ; une grosse idée reçoit d’abord son avis et attend votre « oui ».</p>
            <div className="ar__chips">{SUGGEST.map((s) => <button key={s} className="ar__chip" onClick={() => void send(s)}>{s}</button>)}</div>
            <p className="ar__hint">Tapez <code>/</code> pour les commandes : <code>/usage</code>, <code>/context</code>, <code>/compact</code>… faites par le programme, 0 token.</p>
          </div>
        )}
        {thread.map((m) => {
          if (m.who === 'vous') return (
            <div key={m.id} className={`ar__me ${m.commande ? 'is-cmd' : ''} ${m.btw ? 'is-btw' : ''}`}>
              {m.text && <p>{m.text}</p>}
              {!!m.pieces?.length && <PieceList list={m.pieces} />}
              <span className="ar__time">{hour(m.at)}</span>
            </div>
          );
          if (m.commande) return (
            <article key={m.id} className="ar__prog" aria-label="Réponse du programme">
              <div className="ar__md"><Markdown text={m.text} onLink={() => undefined} /></div>
              <footer className="ar__meta"><span className="ar__chipm">Programme</span><span>0 token</span><span>{hour(m.at)}</span></footer>
            </article>
          );
          if (m.who === 'action') return <div key={m.id} className="ar__act"><Wrench size={12} aria-hidden="true" /><code>{m.text}</code><span className="ar__time">{hour(m.at)}</span></div>;
          if (m.who === 'systeme') return <div key={m.id} className={`ar__sys ${m.ok === false ? 'is-ko' : ''}`} title={m.detail}>{m.text}</div>;
          return (
            <article key={m.id} className={`ar__him ${m.btw ? 'is-btw' : ''}`}>
              <div className="ar__md"><Markdown text={m.text} onLink={(h) => { const t = h.match(/LBA-\d+/)?.[0]; if (t) go({ kind: 'ticket', ticketId: t }); }} /></div>
              <footer className="ar__meta">
                {m.btw && <span className="ar__chipm is-btw" title="Question en passant : sans outils, pas gardée dans sa mémoire">En passant</span>}
                <span className="ar__chipm">{m.model}</span>
                {m.compte && <span title="Compte Claude utilisé">{m.compte}</span>}
                <span>{fmtTokens(m.tokens ?? 0)} tokens</span>
                {!!m.cacheRead && <span title="Relus depuis le cache : environ 10 fois moins chers">+ {fmtTokens(m.cacheRead)} du cache</span>}
                {!!m.context && <span title="Taille de sa conversation après cette réponse">contexte {fmtTokens(m.context)}</span>}
                {!!m.ms && <span>{Math.round(m.ms / 1000)} s</span>}
                <span>{hour(m.at)}</span>
                <a className="ar__pdf" href={`/api/projects/${projectId}/architecte/avis/${m.id}`} target="_blank" rel="noopener"><FileText size={12} aria-hidden="true" />PDF</a>
              </footer>
            </article>
          );
        })}
        {working && <div className="ar__busy"><Loader2 size={14} className="spin" aria-hidden="true" />L’Architecte travaille… {elapsed} s</div>}
        {data?.btw && <div className="ar__busy"><Loader2 size={14} className="spin" aria-hidden="true" />Réponse en passant…</div>}
      </div>

      <div className={`ar__compose ${drag ? 'is-drag' : ''}`} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
        {(pieces.length > 0 || uploading > 0) && (
          <div className="ar__attached">
            <PieceList list={pieces} remove={(p) => setPieces((ps) => ps.filter((x) => x.file !== p.file))} />
            {uploading > 0 && <span className="ar__up"><Loader2 size={13} className="spin" aria-hidden="true" />Envoi de {uploading} pièce{uploading > 1 ? 's' : ''}…</span>}
          </div>
        )}
        {matches.length > 0 && (
          <ul className="ar__cmds" role="listbox" aria-label="Commandes">
            {matches.map((c, i) => (
              <li key={c.name}>
                <button type="button" className={i === 0 ? 'is-first' : ''} onMouseDown={(e) => { e.preventDefault(); complete(c.name); }}>
                  <code>/{c.name}{c.args ? ` ${c.args}` : ''}</code><span>{c.what}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="sr-only" htmlFor="ar-input">Votre demande à l’Architecte</label>
        <textarea id="ar-input" ref={input} rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onPaste={onPaste} disabled={sending}
          placeholder={working ? 'Il répond à votre demande précédente… Une question en passant : /btw votre question' : 'Écrivez votre demande. Entrée pour envoyer, Maj + Entrée pour aller à la ligne. Collez ou glissez des photos et documents.'} />
        <div className="ar__opts">
          <label className="ar__opt">Modèle
            <select value={data?.model ?? 'auto'} onChange={(e) => void setting({ model: e.target.value })} aria-label="Modèle de l’Architecte">
              <option value="auto">Auto ({pickArchitectModel(text)})</option>
              {ARCHITECT_MODELS.map((m) => <option key={m.id} value={m.id} title={m.what}>{m.label} ({m.short})</option>)}
              <option value="Fable" disabled>Fable 5.2 (jamais : votre règle)</option>
            </select>
          </label>
          <label className="ar__opt">Compte
            <select value={data?.compte ?? 'auto'} onChange={(e) => void setting({ compte: e.target.value })} aria-label="Compte Claude de l’Architecte">
              <option value="auto">Auto ({data?.compteAuto ?? '…'})</option>
              {(data?.comptes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{pct(c.five)}</option>)}
            </select>
          </label>
          <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { if (e.target.files) void attach(e.target.files); e.target.value = ''; }} />
          <button type="button" className="btn btn--ghost btn--sm ar__clip" onClick={() => fileInput.current?.click()} disabled={pieces.length >= MAX_PIECES} title="Joindre des photos ou documents (8 au plus, 10 Mo chacun)">
            <Paperclip size={14} aria-hidden="true" />Joindre
          </button>
        </div>
        <div className="ar__bar">
          <span className="ar__cost">{matches.length > 0 && (!cmd || cmd.name === 'inconnue')
            ? <>Choisissez une commande : <b>Tab</b> pour compléter. Toutes sont faites par le programme (0 token), sauf /btw.</>
            : cmd?.name === 'btw'
            ? <>Question en passant : Sonnet <b>sans outils</b>, environ <b>2 à 4 k</b> tokens (mesuré : 2,5 k). Elle n’entre pas dans sa mémoire.</>
            : cmd
            ? (cmd.name === 'inconnue' ? <>Commande inconnue : tapez <b>/aide</b> pour la liste.</> : <>Commande faite par le programme : <b>0 token</b>, réponse tout de suite.</>)
            : text.trim() || pieces.length ? <>Partira sur <b>{model}</b>, {ARCHITECT_COST[model]} tokens{pieces.length ? <> + pièces jointes ≈ <b>{fmtTokens(piecesTokens)}</b></> : ''}. « /opus », « /sonnet » ou « /haiku » au début pour choisir.</>
            : 'Sonnet pour une consigne, Opus pour l’architecture et les décisions. « / » pour les commandes, /btw pour une question en passant.'}</span>
          <button className="btn btn--primary btn--sm" onClick={() => void send(text)} disabled={sending || uploading > 0 || (!text.trim() && !pieces.length) || (working && !text.trim().startsWith('/'))}><ArrowUp size={14} />Envoyer</button>
        </div>
      </div>
    </div>
  );
}
