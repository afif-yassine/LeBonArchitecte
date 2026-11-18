// Lire ce qu'un ticket a réalisé : contenu d'un fichier (Markdown rendu lisiblement) ou ses changements.
import { useEffect, useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { Tabs } from './ui';

type Mode = 'contenu' | 'changements';

// Rendu Markdown minimal et sûr (aucun HTML injecté) : titres, listes, code, gras, code en ligne.
function inline(s: string): ReactNode[] {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code>
      : p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p);
}

function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      out.push(<pre key={i} className="md__code">{code.join('\n')}</pre>);
    } else if (/^#{1,4} /.test(l)) {
      const lvl = l.match(/^#+/)![0].length;
      const H = (['h2', 'h3', 'h4', 'h5'] as const)[lvl - 1];
      out.push(<H key={i} className="md__h">{inline(l.replace(/^#+ /, ''))}</H>);
    } else if (/^\s*[-*] /.test(l)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*] /.test(lines[i]); i++) items.push(lines[i].replace(/^\s*[-*] /, ''));
      i--;
      out.push(<ul key={i} className="md__ul">{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>);
    } else if (l.trim()) out.push(<p key={i}>{inline(l)}</p>);
  }
  return <div className="md">{out}</div>;
}

function Diff({ text }: { text: string }) {
  if (!text.trim()) return <p className="muted small">Aucun changement à montrer.</p>;
  return (
    <pre className="diffview">
      {text.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l)).map((l, i) => (
        <span key={i} className={l.startsWith('+') ? 'is-add' : l.startsWith('-') ? 'is-del' : l.startsWith('@@') ? 'is-hunk' : ''}>{l || ' '}{'\n'}</span>
      ))}
    </pre>
  );
}

export function FileViewer({ ticketId, files }: { ticketId: string; files: { path: string; plus: number; minus: number }[] }) {
  const [open, setOpen] = useState<string | null>(files.find((f) => f.path.endsWith('.md'))?.path ?? files[0]?.path ?? null);
  const [mode, setMode] = useState<Mode>('contenu');
  const [data, setData] = useState<{ content?: string; diff?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let off = false;
    setData(null);
    fetch(`/api/tickets/${ticketId}/file?path=${encodeURIComponent(open)}${mode === 'changements' ? '&diff=1' : ''}`)
      .then(async (r) => { const j = await r.json(); if (!off) setData(r.ok ? j : { error: j.message }); })
      .catch(() => { if (!off) setData({ error: 'Le moteur est arrêté : lancez « npm run dev ».' }); });
    return () => { off = true; };
  }, [ticketId, open, mode]);

  return (
    <>
      <ul className="files">
        {files.map((f) => (
          <li key={f.path}>
            <button className={`fileopen ${open === f.path ? 'is-open' : ''}`} onClick={() => setOpen(open === f.path ? null : f.path)} aria-expanded={open === f.path}>
              <FileText size={14} aria-hidden="true" /><span className="mono">{f.path}</span>
            </button>
            <span className="diffstat"><span className="plus">+{f.plus}</span><span className="minus">−{f.minus}</span></span>
          </li>
        ))}
      </ul>
      {open && (
        <div className="fileview">
          <div className="fileview__head">
            <span className="mono small">{open}</span>
            <Tabs<Mode> label="Voir le fichier" value={mode} onChange={setMode} tabs={[{ id: 'contenu', label: 'Contenu' }, { id: 'changements', label: 'Changements' }]} />
          </div>
          <div className="fileview__body">
            {!data ? <p className="faint small">Lecture…</p>
              : data.error ? <p className="muted small">{data.error}</p>
                : mode === 'changements' ? <Diff text={data.diff ?? ''} />
                  : open.endsWith('.md') ? <Markdown text={data.content ?? ''} /> : <pre className="md__code">{data.content}</pre>}
          </div>
        </div>
      )}
    </>
  );
}
