// Comptes Claude et quotas (décision 0017, lots C3 et C4) : la vraie liste, plus la petite jauge du haut de l'écran.
// Rien n'est inventé : un quota s'affiche seulement s'il a été lu dans un appel de Claude Code.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Gauge, LogIn, Plus, RefreshCw, X } from 'lucide-react';
import { Bar, Setting } from './ui';
import { useNotify } from './notify';
import { useApi } from '../screens/RealSpaces';
import '../comptes.css';

interface Fenetre { used: number; resetsAt?: string }
export interface CompteVu {
  id: string; name: string; on: boolean; projects: string[]; dir: string; machine: boolean;
  loggedIn: boolean; email?: string; plan?: string;
  quota: { five?: Fenetre; week?: Fenetre; status?: string; at: string; fivePrevu?: number; weekPrevu?: number } | null;
}
interface ComptesData { comptes: CompteVu[]; projets: string[]; choix: Record<string, { architecte: string | null; agents: string | null; autoArchitecte: string; autoAgents: string }> }

const p100 = (v?: number) => (v === undefined ? '…' : `${Math.round(v * 100)} %`);
// « dans 2 h 05 » ou « dans 3 j 4 h »
export function untilReset(iso?: string, now = Date.now()): string {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  if (m >= 1440) return `dans ${Math.floor(m / 1440)} j ${Math.floor((m % 1440) / 60)} h`;
  return `dans ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
const since = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60_000); return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
// Couleur de la prévision : vert, orange au-delà de 80 %, rouge au-delà de 100 %.
const tone = (v?: number) => (v === undefined ? '' : v >= 1 ? 'is-red' : v >= 0.8 ? 'is-orange' : 'is-green');

function Window({ label, f, prevu, compact }: { label: string; f?: Fenetre; prevu?: number; compact?: boolean }) {
  return (
    <div className="qw">
      <div className="meter__head">
        <span>{label}</span>
        <span className="num">{p100(f?.used)}{prevu !== undefined && <span className={`qw__prevu ${tone(prevu)}`} title="Prévu à la remise à zéro, au rythme actuel"> → {p100(prevu)}</span>}</span>
      </div>
      <Bar value={(f?.used ?? 0) * 100} label={`${label} : ${p100(f?.used)}`} />
      {!compact && f?.resetsAt && <div className="qw__reset">remise à zéro {untilReset(f.resetsAt)}</div>}
    </div>
  );
}

// Réglages › Comptes et quotas.
export function ComptesPanel() {
  const notify = useNotify();
  const { data, error } = useApi<ComptesData>('/comptes');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const call = async (key: string, method: string, path: string, body?: unknown) => {
    setBusy(key);
    try {
      const r = await fetch(`/api${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const j = await r.json();
      notify(j.message ?? (r.ok ? 'Fait.' : 'Refusé.'));
      return r.ok;
    } catch { notify('Le moteur est arrêté : lancez « npm run dev ».'); return false; }
    finally { setBusy(null); }
  };
  if (error) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Lecture des comptes…</p>;
  const list = data.comptes;

  return (
    <>
      <div className="setgroup">
        <h2>Comptes Claude Code</h2>
        <p>Chaque nouvel agent part sur le premier compte actif de la liste, permis pour son projet, dont la fenêtre de 5 h est sous 90 %. Vous pouvez aussi fixer un compte par projet, plus bas. Une conversation reprise reste sur le compte qui l’a commencée.</p>
        {list.map((c, i) => (
          <section key={c.id} className={`conn ${c.on ? '' : 'is-off'}`} aria-label={c.name}>
            <div className="conn__head">
              <span className="conn__logo" aria-hidden="true">{c.name.slice(0, 2).toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="conn__name">{c.name}{!c.on && <span className="faint xsmall"> : désactivé</span>}</div>
                <div className="conn__sub">
                  {c.loggedIn ? <><span className="pill pill--ok pill--dot">Connecté</span> {c.email}{c.plan ? `, forfait ${c.plan}` : ''}</> : <span className="pill pill--danger pill--dot">Pas connecté</span>}
                  <span className="mono faint xsmall" style={{ marginLeft: 8 }}>{c.dir}</span>
                </div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn--ghost btn--icon" aria-label={`Monter ${c.name}`} disabled={i === 0 || !!busy} onClick={() => void call(c.id, 'PATCH', `/comptes/${c.id}`, { move: -1 })}><ArrowUp size={15} /></button>
                <button className="btn btn--ghost btn--icon" aria-label={`Descendre ${c.name}`} disabled={i === list.length - 1 || !!busy} onClick={() => void call(c.id, 'PATCH', `/comptes/${c.id}`, { move: 1 })}><ArrowDown size={15} /></button>
              </div>
            </div>
            <div className="conn__acc">
              <div className="xsmall muted">
                {c.quota ? <>Quota lu {since(c.quota.at)}.{c.quota.status && c.quota.status !== 'allowed' && <> <b>Limite atteinte.</b></>}</> : 'Quota pas encore lu : il le sera au prochain travail, ou avec « Actualiser ».'}
              </div>
              <Window label="5 heures" f={c.quota?.five} prevu={c.quota?.fivePrevu} />
              <Window label="7 jours" f={c.quota?.week} prevu={c.quota?.weekPrevu} />
              <button className="btn btn--ghost btn--icon" aria-label={`Actualiser le quota de ${c.name}`} title="Actualiser : un tout petit appel Haiku, environ 3 000 tokens (0,0006 $)" disabled={!!busy || !c.loggedIn} onClick={() => void call(`q-${c.id}`, 'POST', `/comptes/${c.id}/quota`)}>
                <RefreshCw size={15} className={busy === `q-${c.id}` ? 'spin' : undefined} />
              </button>
            </div>
            <div className="conn__foot">
              <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={c.on} disabled={!!busy} onChange={(e) => void call(c.id, 'PATCH', `/comptes/${c.id}`, { on: e.target.checked })} />Actif</label>
              <span className="faint">Réservé à :</span>
              {data.projets.map((p) => (
                <label key={p} className="row" style={{ gap: 4 }}>
                  <input type="checkbox" checked={c.projects.includes(p)} disabled={!!busy}
                    onChange={(e) => void call(c.id, 'PATCH', `/comptes/${c.id}`, { projects: e.target.checked ? [...c.projects, p] : c.projects.filter((x) => x !== p) })} />{p}
                </label>
              ))}
              {!c.projects.length && <span className="faint xsmall">(aucun coché = tous les projets)</span>}
              <span style={{ flex: 1 }} />
              <button className="btn btn--sm" disabled={!!busy} onClick={() => void call(c.id, 'POST', `/comptes/${c.id}/connexion`)}><LogIn size={14} />{c.loggedIn ? 'Se reconnecter' : 'Se connecter'}</button>
              {!c.machine && <button className="btn btn--sm btn--ghost" disabled={!!busy} onClick={() => void call(c.id, 'DELETE', `/comptes/${c.id}`)}><X size={14} />Retirer</button>}
            </div>
          </section>
        ))}
        <form className="conn__add" onSubmit={async (e) => { e.preventDefault(); if (await call('add', 'POST', '/comptes', { name })) setName(''); }}>
          <label htmlFor="new-account" className="sr-only">Nom du nouveau compte</label>
          <input id="new-account" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du compte, par exemple « Compte perso »" maxLength={40} />
          <button className="btn btn--sm" disabled={!name.trim() || !!busy}><Plus size={14} />Ajouter et se connecter</button>
        </form>
        <p className="xsmall faint" style={{ marginTop: 8 }}>« Ajouter » ouvre une fenêtre de connexion de Claude : c’est vous qui vous connectez, dans le navigateur. LBA ne voit jamais votre mot de passe ni votre jeton, et les agents n’ont pas le droit de lire les dossiers des comptes. Utilisez seulement vos propres comptes, dans les règles de votre abonnement.</p>
      </div>

      <div className="setgroup">
        <h2>Compte par projet</h2>
        {data.projets.map((p) => {
          const ch = data.choix[p];
          const options = list.filter((c) => c.on && (!c.projects.length || c.projects.includes(p)));
          const nameOf = (id: string) => list.find((c) => c.id === id)?.name ?? id;
          return (['architecte', 'agents'] as const).map((who) => (
            <Setting key={`${p}-${who}`} label={`${p} : ${who === 'architecte' ? 'Architecte' : 'agents des tickets'}`} desc={`Automatique maintenant : ${nameOf(who === 'architecte' ? ch.autoArchitecte : ch.autoAgents)}.`}>
              <select value={ch[who] ?? 'auto'} disabled={!!busy} aria-label={`Compte ${who} pour ${p}`} onChange={(e) => void call(`${p}-${who}`, 'POST', `/projects/${p}/comptes`, { [who]: e.target.value })}>
                <option value="auto">Automatique</option>
                {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Setting>
          ));
        })}
      </div>
    </>
  );
}

// Haut de l'écran : le quota 5 h du compte le plus chargé ; un clic montre tous les comptes.
export function QuotaChip({ onOpen }: { onOpen: () => void }) {
  const { data } = useApi<ComptesData>('/comptes');
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number }>({ top: 56, right: 16 });
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const on = (data?.comptes ?? []).filter((c) => c.on);
  const read = on.filter((c) => c.quota?.five);
  const top = [...read].sort((a, b) => (b.quota!.five!.used) - (a.quota!.five!.used))[0];
  const v = top?.quota?.five?.used;
  return (
    <div className="qchip" ref={box}>
      <button className={`btn btn--ghost btn--sm qchip__btn ${v !== undefined && v >= 0.9 ? 'is-red' : v !== undefined && v >= 0.75 ? 'is-orange' : ''}`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setAt({ top: r.bottom + 6, right: Math.max(16, innerWidth - r.right) }); setOpen((o) => !o); }} aria-expanded={open}
        aria-label={v === undefined ? 'Quotas des comptes Claude : pas encore lus' : `Quota 5 heures le plus haut : ${p100(v)}, ${top!.name}`} title="Quotas des comptes Claude">
        <Gauge size={15} aria-hidden="true" /><span className="qchip__txt">5 h {v === undefined ? '…' : p100(v)}{read.length > 1 ? ` · ${on.length} comptes` : ''}</span>
      </button>
      {open && createPortal(
        <div ref={pop} className="qchip__pop" style={{ top: at.top, right: at.right }} role="dialog" aria-label="Quotas des comptes Claude">
          <div className="qchip__title">Comptes Claude Code</div>
          {on.map((c) => (
            <div key={c.id} className="qchip__acc">
              <div className="qchip__name">{c.name}{!c.loggedIn && <span className="faint"> : pas connecté</span>}</div>
              {c.quota ? (
                <div className="qchip__wins">
                  <Window label="5 h" f={c.quota.five} prevu={c.quota.fivePrevu} />
                  <Window label="7 j" f={c.quota.week} prevu={c.quota.weekPrevu} />
                </div>
              ) : <div className="xsmall faint">Pas encore lu.</div>}
              {c.quota && <div className="xsmall faint">Lu {since(c.quota.at)}</div>}
            </div>
          ))}
          <p className="xsmall faint qchip__note">Lu dans chaque réponse de Claude Code, sans coût. « → » : prévu à la remise à zéro au rythme actuel (vert, orange au-delà de 80 %, rouge au-delà de 100 %).</p>
          <button className="btn btn--sm" onClick={() => { setOpen(false); onOpen(); }}>Gérer les comptes</button>
        </div>,
        document.body,
      )}
    </div>
  );
}
