// Lire ce qu'un ticket a réalisé : contenu d'un fichier (Markdown rendu lisiblement) ou ses changements.
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { Tabs } from './ui';
import { Markdown } from './Markdown';

type Mode = 'contenu' | 'changements';

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
            {f.path.endsWith('.pdf') ? (
              <a className="fileopen" href={`/api/tickets/${ticketId}/raw?path=${encodeURIComponent(f.path)}`} target="_blank" rel="noopener">
                <FileText size={14} aria-hidden="true" /><span className="mono">{f.path}</span><span className="faint xsmall">ouvrir le PDF</span>
              </a>
            ) : (
              <button className={`fileopen ${open === f.path ? 'is-open' : ''}`} onClick={() => setOpen(open === f.path ? null : f.path)} aria-expanded={open === f.path}>
                <FileText size={14} aria-hidden="true" /><span className="mono">{f.path}</span>
              </button>
            )}
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
