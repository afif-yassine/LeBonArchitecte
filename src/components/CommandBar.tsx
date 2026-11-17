import { useState } from 'react';
import { ArrowUp } from 'lucide-react';

// Barre du bas, présente partout : on écrit à l'Architecte sans quitter l'écran.
// Le message ouvre la conversation de l'Architecte, qui le traite (commandes « / » par règles, 0 token).
export function CommandBar({ onAsk }: { onAsk: (text: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form className="cmdbar" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAsk(v.trim()); setV(''); } }}>
      <span className="orb" aria-hidden="true" style={{ width: 18, height: 18 }} />
      <label className="sr-only" htmlFor="cmdbar">Écrire à l’Architecte</label>
      <input id="cmdbar" value={v} onChange={(e) => setV(e.target.value)} placeholder="Écrire à l’Architecte… (/ pour les commandes, @ pour un ticket)" autoComplete="off" />
      <span className="cmdbar__hint"><span className="kbd">/</span> depuis n’importe où</span>
      <button className="btn btn--primary btn--icon btn--sm" type="submit" aria-label="Envoyer" disabled={!v.trim()}><ArrowUp size={15} /></button>
    </form>
  );
}
