import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

// Lancer soi-même un ticket. Si la limite d'agents est atteinte, on choisit quel ticket arrêter
// (il reprendra plus tard avec sa passation) ou on met le ticket en tête de file.
export function LaunchDialog({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { tickets, running, autopilot, isReady, launch, move } = useStore();
  const t = tickets.find((x) => x.id === ticketId)!;
  const run = running(t.projectId);
  const full = run.length >= autopilot.maxParallel;
  const ready = isReady(t);
  const missing = t.deps.filter((d) => tickets.find((x) => x.id === d)?.status !== 'termine');
  const [choice, setChoice] = useState<string>(full ? run[0]?.id ?? 'file' : 'now');
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const confirm = () => {
    if (choice === 'file') {
      for (let i = 0; i < 20; i++) move(t.id, -1);
    } else {
      launch(t.id, choice === 'now' ? undefined : choice);
    }
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="launch-title">
        <h2 id="launch-title">Lancer {t.id} maintenant</h2>
        <p className="muted">{t.title}</p>
        {!ready && (
          <p className="flag flag--wait" style={{ marginTop: 10 }}>
            Attention : {missing.join(' et ')} {missing.length > 1 ? 'ne sont pas finis' : 'n’est pas fini'}. L’agent risque de travailler sur une base incomplète.
          </p>
        )}
        <div className="modal__opts" role="radiogroup" aria-label="Comment lancer">
          {!full && (
            <button className="opt" role="radio" aria-checked={choice === 'now'} onClick={() => setChoice('now')}>
              <span className="opt__radio" />
              <span><span className="opt__title">Lancer tout de suite</span><span className="opt__desc" style={{ display: 'block' }}>Une place est libre ({run.length} sur {autopilot.maxParallel}).</span></span>
            </button>
          )}
          {full && run.map((r) => (
            <button key={r.id} className="opt" role="radio" aria-checked={choice === r.id} onClick={() => setChoice(r.id)}>
              <span className="opt__radio" />
              <span>
                <span className="opt__title">Arrêter {r.id} et lancer {t.id}</span>
                <span className="opt__desc" style={{ display: 'block' }}>{r.title}. Arrêt propre, passation écrite, il revient en tête de file.</span>
              </span>
            </button>
          ))}
          <button className="opt" role="radio" aria-checked={choice === 'file'} onClick={() => setChoice('file')}>
            <span className="opt__radio" />
            <span><span className="opt__title">Le mettre en tête de file</span><span className="opt__desc" style={{ display: 'block' }}>Le pilote le lancera dès qu’une place se libère.</span></span>
          </button>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose}>Annuler</button>
          <button ref={ref} className="btn btn--primary" onClick={confirm}>{choice === 'file' ? 'Mettre en tête' : 'Lancer'}</button>
        </div>
      </div>
    </div>
  );
}
