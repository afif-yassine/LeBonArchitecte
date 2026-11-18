// Écran Architecte (vrai projet, décision 0014, lot C) : vous lui parlez comme à Claude Code.
// Il agit seul sur le projet avec la commande lba ; chaque action s'affiche sur une ligne ; chaque réponse
// montre son modèle, ses tokens, la taille de sa conversation et sa durée, et sort en PDF.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, FileText, Loader2, Wrench } from 'lucide-react';
import { Markdown } from '../components/Markdown';
import { fmtTokens } from '../components/ui';
import { useNotify } from '../components/notify';
import { ARCHITECT_COST, pickArchitectModel } from '../shared/architect';
import { useApi } from './RealSpaces';
import type { Go } from '../view';
import '../architect.css';

interface Msg { id: number; at: string; who: 'vous' | 'architecte' | 'action' | 'systeme'; text: string; model?: string; tokens?: number; cacheRead?: number; context?: number; ms?: number; ok?: boolean; detail?: string }

const SUGGEST = [
  'Où en est le projet, et que ferais-tu ensuite ?',
  'Quel ticket faut-il lancer en premier, et pourquoi ?',
  'Fais une revue de l’architecture et des risques.',
];
const hour = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function ArchitectLive({ projectId, go, ask }: { projectId: string; go: Go; ask?: string }) {
  const notify = useNotify();
  const { data } = useApi<{ busy: boolean; thread: Msg[] }>(`/projects/${projectId}/architecte`);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);
  const thread = data?.thread ?? [];
  const busy = Boolean(data?.busy) || sending;

  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [thread.length, busy]);
  useEffect(() => { input.current?.focus(); }, []);
  // Chrono pendant qu'il travaille.
  useEffect(() => { if (!busy) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [busy]);

  const send = async (raw: string) => {
    const t = raw.trim();
    if (!t || busy) return;
    setSending(true); setText('');
    try {
      const r = await fetch(`/api/projects/${projectId}/architecte`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t }) });
      const j = await r.json();
      if (!r.ok) { notify(j.message ?? 'Refusé.'); setText(t); }
    } catch { notify('Le moteur est arrêté : lancez « npm run dev ».'); setText(t); }
    finally { setSending(false); }
  };
  // La barre « Écrire à l'Architecte… » du bas de chaque page arrive ici avec la demande.
  useEffect(() => { if (ask && !asked.current) { asked.current = true; void send(ask); } }, [ask]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); }
  };
  const model = pickArchitectModel(text);
  const lastAsk = [...thread].reverse().find((m) => m.who === 'vous');
  const elapsed = busy && lastAsk ? Math.max(0, Math.round((now - Date.parse(lastAsk.at)) / 1000)) : 0;
  const today = thread.filter((m) => m.who === 'architecte' && new Date(m.at).toDateString() === new Date().toDateString());
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
          </div>
        )}
        {thread.map((m) => {
          if (m.who === 'vous') return <div key={m.id} className="ar__me"><p>{m.text}</p><span className="ar__time">{hour(m.at)}</span></div>;
          if (m.who === 'action') return <div key={m.id} className="ar__act"><Wrench size={12} aria-hidden="true" /><code>{m.text}</code><span className="ar__time">{hour(m.at)}</span></div>;
          if (m.who === 'systeme') return <div key={m.id} className={`ar__sys ${m.ok === false ? 'is-ko' : ''}`} title={m.detail}>{m.text}</div>;
          return (
            <article key={m.id} className="ar__him">
              <div className="ar__md"><Markdown text={m.text} onLink={(h) => { const t = h.match(/LBA-\d+/)?.[0]; if (t) go({ kind: 'ticket', ticketId: t }); }} /></div>
              <footer className="ar__meta">
                <span className="ar__chipm">{m.model}</span>
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
        {busy && <div className="ar__busy"><Loader2 size={14} className="spin" aria-hidden="true" />L’Architecte travaille… {elapsed} s</div>}
      </div>

      <div className="ar__compose">
        <label className="sr-only" htmlFor="ar-input">Votre demande à l’Architecte</label>
        <textarea id="ar-input" ref={input} rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} disabled={busy}
          placeholder={busy ? 'Il répond à votre demande précédente…' : 'Écrivez votre demande. Entrée pour envoyer, Maj + Entrée pour aller à la ligne.'} />
        <div className="ar__bar">
          <span className="ar__cost">{text.trim() ? <>Partira sur <b>{model}</b>, {ARCHITECT_COST[model]} tokens. « /opus » ou « /sonnet » au début pour choisir.</> : 'Sonnet pour une consigne, Opus pour l’architecture, les décisions et l’équipe.'}</span>
          <button className="btn btn--primary btn--sm" onClick={() => void send(text)} disabled={busy || !text.trim()}><ArrowUp size={14} />Envoyer</button>
        </div>
      </div>
    </div>
  );
}
