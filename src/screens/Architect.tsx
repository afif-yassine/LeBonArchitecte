// L'Architecte : la personne avec qui vous parlez, comme dans Claude Code ou Codex.
// Les commandes « / » et les questions d'état sont traitées par règles (0 token).
// Les vraies questions vont à l'IA, avec seulement le contexte utile.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, AtSign, CircleDot, Image as ImageIcon, Lightbulb, ListChecks, Paperclip, Sparkles, Wrench } from 'lucide-react';
import { archHistory, memory, projects } from '../mock/data';
import type { ArchItem } from '../shared/contract';
import { fmtTokens } from '../components/ui';
import { useNotify } from '../components/notify';
import { useStore } from '../store';
import type { Go } from '../view';

const COMMANDS: { cmd: string; args?: string; desc: string }[] = [
  { cmd: '/btw', args: 'question', desc: 'Question rapide à côté. N’entre pas dans le contexte.' },
  { cmd: '/plan', args: 'but', desc: 'Préparer un plan avant d’agir. Rien n’est lancé sans vous.' },
  { cmd: '/statut', desc: 'Où en est le projet. Par règles, 0 token.' },
  { cmd: '/ticket', args: 'titre', desc: 'Proposer un ticket. Doublons vérifiés avant.' },
  { cmd: '/lance', args: 'T-17 [codex]', desc: 'Lancer un ticket.' },
  { cmd: '/arrete', args: 'T-13', desc: 'Arrêter proprement un ticket, avec passation.' },
  { cmd: '/valide', args: 'T-14', desc: 'Valider un ticket à tester.' },
  { cmd: '/retiens', args: 'fait', desc: 'Enregistrer une note dans la mémoire partagée.' },
  { cmd: '/memoire', args: 'recherche', desc: 'Chercher dans la mémoire, sans tout lire.' },
  { cmd: '/regle', args: 'règle', desc: 'Ajouter une règle du projet (CLAUDE.md et AGENTS.md).' },
  { cmd: '/decision', args: 'texte', desc: 'Écrire une décision avec son interdit.' },
  { cmd: '/contexte', desc: 'Voir ce que l’Architecte a en tête et combien ça coûte.' },
  { cmd: '/compact', desc: 'Résumer la conversation pour alléger le contexte.' },
  { cmd: '/nouveau', desc: 'Nouvelle conversation, avec passation.' },
  { cmd: '/modele', args: 'haiku | sonnet | opus', desc: 'Changer de modèle. Jamais Fable.' },
  { cmd: '/cout', desc: 'Consommation du jour et du projet.' },
  { cmd: '/rapport', desc: 'Écrire le compte rendu des tickets non rapportés.' },
  { cmd: '/aide', desc: 'Toutes les commandes.' },
];

const now = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const MODELS = ['Haiku', 'Sonnet', 'Opus'];

export function Architect({ projectId, ask }: { projectId: string; go: Go; ask?: string }) {
  const notify = useNotify();
  const store = useStore();
  const p = projects.find((x) => x.id === projectId)!;
  const [items, setItems] = useState<ArchItem[]>(archHistory);
  const [text, setText] = useState('');
  const [model, setModel] = useState('Sonnet');
  const [plan, setPlan] = useState(false);
  const [sel, setSel] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);

  const ctxTokens = 3200 + items.reduce((s, i) => s + (i.type === 'aside' ? 0 : Math.ceil(('text' in i ? i.text.length : 0) / 3.5) + 20), 0);
  const ceiling = 40000;

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [items]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Menu « / » ou « @ » selon ce qu'on tape.
  const lastWord = text.split(/\s/).pop() ?? '';
  const menu = useMemo(() => {
    if (text.startsWith('/') && !text.includes(' ')) return COMMANDS.filter((c) => c.cmd.startsWith(text.toLowerCase())).map((c) => ({ key: c.cmd, label: c.cmd, hint: c.args, desc: c.desc }));
    if (lastWord.startsWith('@')) {
      const q = lastWord.slice(1).toLowerCase();
      return store.tickets.filter((t) => t.projectId === projectId && (t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))).slice(0, 7)
        .map((t) => ({ key: `@${t.id}`, label: `@${t.id}`, hint: undefined, desc: t.title }));
    }
    return [];
  }, [text, lastWord, store.tickets, projectId]);
  useEffect(() => { setSel(0); }, [menu.length]);

  const pick = (key: string) => {
    if (key.startsWith('/')) setText(`${key} `);
    else setText(`${text.slice(0, text.length - lastWord.length)}${key} `);
    inputRef.current?.focus();
  };

  const push = (...add: ArchItem[]) => setItems((l) => [...l, ...add]);
  const answer = (t: string, cost = 'par règles, 0 token', actions?: string[]): ArchItem => ({ type: 'assistant', at: now(), text: t, cost, actions });

  const statusText = () => {
    const ts = store.tickets.filter((t) => t.projectId === projectId);
    const by = (s: string) => ts.filter((t) => t.status === s);
    return `${p.name}, lot ${p.lot.n} « ${p.lot.name} ».\n• En cours : ${by('en-cours').map((t) => t.id).join(', ') || 'rien'}.\n• À tester : ${by('a-tester').map((t) => t.id).join(', ') || 'rien'}.\n• Besoin d’action : ${by('action').map((t) => t.id).join(', ') || 'rien'}.\n• Pilote automatique : ${store.autopilot.on ? 'actif' : 'coupé'}.`;
  };

  const run = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    setText('');
    const [cmd, ...rest] = v.split(/\s+/);
    const arg = rest.join(' ');
    const tid = (arg.match(/[a-z]-\d+/i)?.[0] ?? '').toUpperCase();

    if (cmd === '/btw') {
      push({ type: 'aside', question: arg || '…', text: 'Réponse courte donnée à côté, sans interrompre le travail ni entrer dans le contexte de la conversation.', cost: 'Haiku, 120 tokens, hors contexte' });
      return;
    }
    push({ type: 'user', text: v, at: now() });

    switch (cmd) {
      case '/aide': push(answer(COMMANDS.map((c) => `${c.cmd}${c.args ? ` ${c.args}` : ''} : ${c.desc}`).join('\n'))); return;
      case '/statut': push({ type: 'tool', text: 'Lecture de l’état du projet', cost: '0 token' }, answer(statusText())); return;
      case '/contexte': push(answer(`Contexte actuel : ${fmtTokens(ctxTokens)} sur un plafond de ${fmtTokens(ceiling)}.\n• Règles du projet : 640\n• Résumé du projet (généré par le programme) : 1,9 k\n• Mémoire choisie : 4 notes, 310\n• Conversation : ${fmtTokens(ctxTokens - 2850)}\nÀ ${fmtTokens(ceiling * 0.85)}, je compacte une fois, puis je repars en conversation neuve avec passation.`)); return;
      case '/compact': setItems([{ type: 'tool', text: `Conversation résumée : ${items.length} éléments en 1 passation`, cost: 'Haiku, 380 tokens' }, answer('Résumé gardé : lot 2 en cours, T-13 à surveiller (consommation), résumé Playwright proposé. Le reste est dans la mémoire du projet.', 'Haiku')]); return;
      case '/nouveau': setItems([answer('Nouvelle conversation. J’ai lu la passation et le résumé du projet (2,1 k tokens). Que voulez-vous faire ?')]); return;
      case '/modele': {
        const m = MODELS.find((x) => x.toLowerCase() === arg.toLowerCase());
        if (arg.toLowerCase().includes('fable')) push(answer('Fable est interdit par la règle du projet. Je garde ' + model + '.'));
        else if (m) { setModel(m); push(answer(`Modèle changé : ${m}.`)); }
        else push(answer('Modèles possibles : Haiku, Sonnet, Opus.'));
        return;
      }
      case '/lance': {
        const t = store.tickets.find((x) => x.id === tid && x.projectId === projectId);
        if (!t) push(answer(`Je ne trouve pas ${tid || 'ce ticket'} dans ${p.name}.`));
        else if (t.status !== 'a-faire') push(answer(`${t.id} n’est pas à faire.`));
        else { store.launch(t.id); push(answer(`${t.id} démarre${/codex/i.test(arg) ? ' sur Codex' : ''}. Espace de travail et branche créés.`)); }
        return;
      }
      case '/arrete': {
        const t = store.tickets.find((x) => x.id === tid);
        if (t?.status === 'en-cours') { store.stop(t.id); push(answer(`${t.id} arrêté proprement, passation écrite.`)); } else push(answer(`${tid || 'Ce ticket'} n’est pas en cours.`));
        return;
      }
      case '/valide': {
        const t = store.tickets.find((x) => x.id === tid);
        if (t?.status === 'a-tester') { store.validate(t.id); push(answer(`${t.id} validé et réuni dans main.`)); } else push(answer(`${tid || 'Ce ticket'} n’est pas à tester.`));
        return;
      }
      case '/ticket': push({ type: 'tool', text: 'Recherche de doublons : tickets, historique git, code', cost: '0 token' }, answer(`Aucun doublon. Ticket proposé : T-20 « ${arg || 'nouveau ticket'} », lot ${p.lot.n}.`, 'par règles, 0 token', ['Créer T-20', 'Modifier'])); return;
      case '/retiens': push({ type: 'tool', text: 'Recherche d’une note proche dans la mémoire', cost: '0 token' }, answer(`Note enregistrée dans la mémoire du projet : « ${arg} » (${Math.ceil(arg.length / 3.5)} tokens). Les agents la recevront seulement quand elle concerne leur ticket.`)); return;
      case '/memoire': {
        const found = memory.filter((m) => m.text.toLowerCase().includes(arg.toLowerCase())).slice(0, 3);
        push({ type: 'tool', text: `Recherche dans la mémoire : ${found.length} note${found.length > 1 ? 's' : ''}`, cost: '0 token' }, answer(found.length ? found.map((m) => `• ${m.text}`).join('\n') : 'Aucune note ne correspond.'));
        return;
      }
      case '/regle': push(answer(`Règle R-10 ajoutée : « ${arg} ». CLAUDE.md et AGENTS.md regénérés (+${Math.ceil(arg.length / 3.5)} tokens pour chaque agent).`)); return;
      case '/decision': push(answer(`Décision D-05 écrite : « ${arg} ». Son interdit est vérifié par le programme.`)); return;
      case '/cout': push(answer('Aujourd’hui : 50 k tokens sur 200 k. Ce projet : 38 k. Cette conversation : 1,3 k.')); return;
      case '/rapport': store.writeReport(projectId); push(answer('Compte rendu écrit. Il est dans Documents.')); return;
      case '/plan':
        setPlan(true);
        push({ type: 'tool', text: 'Lecture : cahier des charges, backlog, graphe', cost: '0 token' },
          answer(`Plan pour « ${arg || 'votre demande'} » :\n1. Vérifier les exigences liées dans le cahier des charges.\n2. Découper en 2 à 3 tickets courts, doublons vérifiés.\n3. Choisir les rôles (Développeur serveur, Testeur).\n4. Les mettre en file du pilote après T-17.\nRien n’est lancé tant que vous ne validez pas.`, `${model}, 1,6 k tokens`, ['Valider le plan', 'Modifier']));
        return;
      default:
        if (cmd.startsWith('/')) { push(answer(`Commande inconnue : ${cmd}. Tapez /aide.`)); return; }
        if (/où en est|statut|avancement/i.test(v)) { push({ type: 'tool', text: 'Lecture de l’état du projet', cost: '0 token' }, answer(statusText())); return; }
        push({ type: 'tool', text: 'Recherche : mémoire (3 notes), graphe (5 éléments), décisions', cost: '0 token' },
          answer(`(Maquette) Ici, ${model} répondra à votre question avec seulement le contexte utile : règles du projet, notes choisies dans la mémoire et la partie du graphe concernée. Jamais tout le projet.`, `${model}, 900 tokens`));
    }
  };

  useEffect(() => {
    if (ask && !asked.current) { asked.current = true; run(ask); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const onKey = (e: KeyboardEvent) => {
    if (menu.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : menu.length - 1)) % menu.length); return; }
    if (menu.length && (e.key === 'Tab' || (e.key === 'Enter' && !text.includes(' ') && !e.shiftKey))) { e.preventDefault(); pick(menu[sel].key); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(text); }
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); setPlan((v) => !v); }
  };

  const pct = Math.round((ctxTokens / ceiling) * 100);

  return (
    <div className="arch">
      <div className="arch__scroll" ref={scrollRef}>
        <div className="arch__col">
          <div className="arch__intro">
            <span className="orb orb--lg" aria-hidden="true" />
            <div>
              <div className="arch__name">L’Architecte de {p.name}</div>
              <div className="small muted">Posez vos questions, donnez des ordres. Tapez <span className="kbd">/</span> pour les commandes, <span className="kbd">@</span> pour citer un ticket.</div>
            </div>
          </div>

          {items.map((it, i) => {
            if (it.type === 'user') return <div key={i} className="am am--user"><div className="am__user">{it.text}</div></div>;
            if (it.type === 'tool') return <div key={i} className="am am--tool"><CircleDot size={11} />{it.text}<span className="am__cost">{it.cost}</span></div>;
            if (it.type === 'aside') return (
              <div key={i} className="am am--aside">
                <div className="am__aside-q"><Lightbulb size={14} />En passant : {it.question}</div>
                <div>{it.text}</div>
                <div className="am__cost">{it.cost}</div>
              </div>
            );
            return (
              <div key={i} className="am am--assistant">
                <div className="am__head"><span className="orb" aria-hidden="true" /><strong>Architecte</strong><span className="am__cost">{it.at}, {it.cost}</span></div>
                <div className="am__text">{it.text}</div>
                {it.actions && <div className="row" style={{ marginTop: 10 }}>{it.actions.map((a, j) => <button key={a} className={`btn btn--sm ${j === 0 ? 'btn--primary' : ''}`} onClick={() => notify(`Maquette : « ${a} » sera branché au moteur (J2 à J4).`)}>{a}</button>)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="arch__dock">
        <div className="arch__col">
          {menu.length > 0 && (
            <ul className="slash" role="listbox" aria-label="Suggestions">
              {menu.map((m, i) => (
                <li key={m.key} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); pick(m.key); }}>
                  <span className="slash__cmd">{m.label}{m.hint && <span className="faint"> {m.hint}</span>}</span>
                  <span className="slash__desc">{m.desc}</span>
                </li>
              ))}
            </ul>
          )}
          <div className={`prompt ${plan ? 'is-plan' : ''}`}>
            <label className="sr-only" htmlFor="arch-input">Écrire à l’Architecte</label>
            <textarea id="arch-input" ref={inputRef} rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
              placeholder={plan ? 'Mode plan : décrivez ce que vous voulez, je prépare un plan sans rien lancer…' : 'Demandez quelque chose à l’Architecte, ou tapez / pour une commande'} />
            <div className="prompt__bar">
              <button className="btn btn--ghost btn--icon btn--sm" aria-label="Joindre un fichier" title="Joindre un fichier"><Paperclip size={16} /></button>
              <button className="btn btn--ghost btn--icon btn--sm" aria-label="Joindre une image" title="Joindre ou coller une image"><ImageIcon size={16} /></button>
              <button className="btn btn--ghost btn--icon btn--sm" aria-label="Citer un ticket" title="Citer un ticket (@)" onClick={() => { setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@`); inputRef.current?.focus(); }}><AtSign size={16} /></button>
              <span className="prompt__sep" />
              <button className={`chip-btn ${plan ? 'is-on' : ''}`} onClick={() => setPlan((v) => !v)} title="Maj+Tab"><ListChecks size={13} />{plan ? 'Mode plan' : 'Mode normal'}</button>
              <select className="chip-select" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Modèle">{MODELS.map((m) => <option key={m}>{m}</option>)}</select>
              <span style={{ flex: 1 }} />
              <button className="ctx-meter" title="Contexte de cette conversation (/contexte)" onClick={() => run('/contexte')}>
                <span className="ctx-meter__ring" style={{ background: `conic-gradient(var(--${pct > 80 ? 'wait' : 'accent-fill'}) ${pct * 3.6}deg, oklch(from var(--text) l c h / .1) 0)` }} />
                {fmtTokens(ctxTokens)} / {fmtTokens(ceiling)}
              </button>
              <button className="btn btn--primary btn--icon btn--sm" aria-label="Envoyer" onClick={() => run(text)} disabled={!text.trim()}><ArrowUp size={16} /></button>
            </div>
          </div>
          <div className="prompt__foot"><Sparkles size={11} />Les commandes et l’état du projet ne coûtent rien. Seules les vraies questions utilisent l’IA.<span style={{ flex: 1 }} /><Wrench size={11} />Maj+Tab : mode plan</div>
        </div>
      </div>
    </div>
  );
}
