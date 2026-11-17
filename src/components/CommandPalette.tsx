import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { tickets } from '../mock/data';

export interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const TOOL_WORDS: Record<string, string> = { claude: 'Claude, Sonnet', codex: 'Codex, gpt-codex', gemini: 'Gemini' };

export function CommandPalette({ commands, onClose, onLaunch }: { commands: Command[]; onClose: () => void; onLaunch: (ticket: string, tool: string) => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    // Ordre écrit en clair : « lance t-17 sur claude » devient une commande, sans IA.
    const m = q.match(/^\s*lance\s+([a-z]-\d+)(?:\s+sur\s+(\w+))?/i);
    const dynamic: Command[] = [];
    if (m) {
      const id = m[1].toUpperCase();
      const t = tickets.find((x) => x.id === id);
      const tool = TOOL_WORDS[norm(m[2] ?? 'claude')] ?? m[2];
      if (t) dynamic.push({ id: 'dyn', group: 'Lancer', label: `Lancer ${id} sur ${tool}`, hint: 'Entrée', run: () => onLaunch(id, tool) });
    }
    const words = norm(q).split(/\s+/).filter(Boolean);
    const found = m ? [] : commands.filter((c) => words.every((w) => norm(`${c.group} ${c.label}`).includes(w)));
    return [...dynamic, ...found].slice(0, 40);
  }, [q, commands, onLaunch]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSel(0); }, [q]);

  const run = (c?: Command) => { if (!c) return; onClose(); c.run(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(list[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Commandes">
        <div className="palette__input">
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Chercher, ou écrire un ordre : lance T-17 sur claude"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={list[sel] ? `cmd-${list[sel].id}` : undefined}
          />
        </div>
        <ul id="palette-list" role="listbox">
          {list.length === 0 && <li className="palette__none" role="presentation">Rien ne correspond. Essayez un numéro de ticket, comme T-12.</li>}
          {list.map((c, i) => (
            <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
              <span>{c.label}</span>
              <span className="palette__group">{c.hint ? <span className="kbd">{c.hint}</span> : c.group}</span>
            </li>
          ))}
        </ul>
        <div className="palette__foot"><span><span className="kbd">↑</span> <span className="kbd">↓</span> choisir</span><span><span className="kbd">Entrée</span> lancer</span><span><span className="kbd">Échap</span> fermer</span></div>
      </div>
    </div>
  );
}
