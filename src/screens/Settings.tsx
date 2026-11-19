import { useState } from 'react';
import { approvals, budgets, usageByDay, usageByTool } from '../mock/data';
import { RealUsage } from './RealSpaces';
import { ComptesPanel } from '../components/Comptes';
import { Bar, LocalSwitch, Setting, Tabs, fmtTokens, toolLabel } from '../components/ui';
import { useNotify } from '../components/notify';
import { AMBIANCES, type Settings as S, type ThemeChoice } from '../settings';
import type { Go, SettingsTab } from '../view';

function Quotas() {
  const max = Math.max(...usageByDay.map((d) => d.tokens), 1);
  const total = usageByTool.reduce((s, u) => s + u.cost, 0);
  return (
    <>
      <div className="setgroup">
        <h2>Budgets</h2>
        <div className="box">
          <div className="meter__head"><span>Aujourd’hui, tous projets</span><span className="num">{fmtTokens(budgets.usedToday)} sur {fmtTokens(budgets.day)}</span></div>
          <Bar value={budgets.usedToday} max={budgets.day} label="Budget du jour" thick />
          <p className="xsmall faint" style={{ marginTop: 10 }}>Budget dépassé : arrêt propre et « Besoin d’action ». Jamais de dépense cachée.</p>
        </div>
      </div>
      <div className="setgroup">
        <h2>Tokens des 7 derniers jours</h2>
        <div className="box">
          <div className="chart" role="img" aria-label={usageByDay.map((d) => `${d.day} ${fmtTokens(d.tokens)}`).join(', ')}>
            {usageByDay.map((d, i) => (
              <div key={d.day} className={`chart__col ${i === usageByDay.length - 1 ? 'is-today' : ''}`}>
                <span className="chart__val">{d.tokens ? fmtTokens(d.tokens) : '0'}</span>
                <span className="chart__bar" style={{ height: `${(d.tokens / max) * 100}%` }} />
                <span className="chart__day">{d.day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="setgroup">
        <h2>Par outil et modèle, ce mois-ci</h2>
        <table className="table">
          <thead><tr><th>Outil</th><th>Modèle</th><th className="num">Tokens</th><th className="num">Coût estimé</th><th className="num">Validés du 1er coup</th></tr></thead>
          <tbody>
            {usageByTool.map((u) => (
              <tr key={u.tool + u.model}><td>{toolLabel(u.tool)}</td><td>{u.model}</td><td className="num">{fmtTokens(u.tokens)}</td><td className="num">{u.cost.toFixed(2).replace('.', ',')} $</td><td className="num">{u.firstTry} %</td></tr>
            ))}
            <tr><td colSpan={3} className="cell-strong">Total</td><td className="num cell-strong">{total.toFixed(2).replace('.', ',')} $</td><td /></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Security() {
  const notify = useNotify();
  const [list, setList] = useState(approvals);
  return (
    <>
      <div className="setgroup">
        <h2>Interdits par défaut</h2>
        <p>Valables pour tous les projets. Chaque projet peut en ajouter.</p>
        <Setting label="Push, merge, déploiement" desc="Toujours sur votre accord."><span className="pill pill--sec">bloqué</span></Setting>
        <Setting label="Lecture de .env et des clés" desc="Les agents ne voient jamais vos secrets."><span className="pill pill--sec">bloqué</span></Setting>
        <Setting label="rm -rf et suppressions" desc="Aucune suppression sans votre accord."><span className="pill pill--sec">bloqué</span></Setting>
        <Setting label="Écriture hors du projet"><span className="pill pill--sec">bloqué</span></Setting>
        <Setting label="curl | bash et scripts téléchargés"><span className="pill pill--sec">bloqué</span></Setting>
        <Setting label="Masquer les secrets partout" desc="Dans les journaux, la conversation et les rapports."><LocalSwitch initial label="Masquer les secrets" /></Setting>
      </div>
      <div className="setgroup">
        <h2>Approbations durables</h2>
        <p>Ce que vous avez déjà autorisé, avec sa portée et sa date de fin.</p>
        <table className="table">
          <thead><tr><th>Autorisation</th><th>Portée</th><th>Jusqu’au</th><th /></tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}><td>{a.what}</td><td className="muted">{a.scope}</td><td className="muted">{a.until}</td>
                <td className="num"><button className="btn btn--ghost btn--sm" onClick={() => { setList((l) => l.filter((x) => x.id !== a.id)); notify('Autorisation retirée.'); }}>Retirer</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="setgroup">
        <h2>Journal d’audit</h2>
        <p>Chaque action sensible est enregistrée : qui, quoi, quand, et votre accord.</p>
        <button className="btn btn--sm" onClick={() => notify('Maquette : journal d’audit complet (J2).')}>Ouvrir le journal</button>
      </div>
    </>
  );
}

function Appearance({ settings, update }: { settings: S; update: (p: Partial<S>) => void }) {
  const themes: [ThemeChoice, string][] = [['auto', 'Automatique'], ['clair', 'Clair doux'], ['sombre', 'Sombre doux']];
  return (
    <div className="setgroup">
      <h2>Ambiance</h2>
      <p>Trois designs complets : police, couleurs et formes changent ensemble. Essayez-les, le changement est immédiat.</p>
      <div className="ambs">
        {AMBIANCES.map((a) => (
          <button key={a.id} className="amb" aria-pressed={settings.ambiance === a.id} onClick={() => update({ ambiance: a.id })}>
            <div className="amb__preview" data-amb={a.id} style={{ background: 'var(--side)' }}>
              <i style={{ background: 'var(--bg)', border: '1px solid var(--line)' }} />
              <span style={{ display: 'grid', gap: 5, alignContent: 'start' }}>
                <i style={{ height: 10, width: '60%', background: 'var(--text-strong)', opacity: .8 }} />
                <i style={{ height: 22, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-s)' }} />
                <i style={{ height: 10, width: 46, background: 'var(--accent-fill)', borderRadius: 'var(--r-xs)' }} />
              </span>
            </div>
            <div className="amb__body" data-amb={a.id} style={{ fontFamily: 'var(--font)' }}>
              <div className="amb__name">{a.label}</div>
              <div className="amb__desc">{a.desc}</div>
            </div>
          </button>
        ))}
      </div>
      <h2 style={{ marginTop: 30 }}>Lumière</h2>
      <Setting label="Thème" desc="Automatique : clair de 7 h à 19 h, sombre le reste du temps.">
        <div className="seg">{themes.map(([id, l]) => <button key={id} aria-pressed={settings.theme === id} onClick={() => update({ theme: id })}>{l}</button>)}</div>
      </Setting>
      <Setting label="Taille du texte">
        <div className="seg">{[0.93, 1, 1.07, 1.15].map((s, i) => <button key={s} aria-pressed={settings.scale === s} aria-label={`Taille ${i + 1}`} onClick={() => update({ scale: s })} style={{ fontSize: `${0.8 + i * 0.09}rem`, minWidth: 40 }}>A</button>)}</div>
      </Setting>
      <Setting label="Densité">
        <div className="seg">
          <button aria-pressed={settings.density === 'aeree'} onClick={() => update({ density: 'aeree' })}>Aérée</button>
          <button aria-pressed={settings.density === 'compacte'} onClick={() => update({ density: 'compacte' })}>Compacte</button>
        </div>
      </Setting>
      <Setting label="Filtre de lumière bleue le soir" desc="Un voile ambré très léger de 20 h à 7 h."><LocalSwitch initial={settings.nightFilter} label="Filtre du soir" onToggle={(v) => update({ nightFilter: v })} /></Setting>
      <Setting label="Animations" desc="Courtes et discrètes. Le réglage « réduire les animations » de Windows est toujours respecté."><LocalSwitch initial={settings.motion} label="Animations" onToggle={(v) => update({ motion: v })} /></Setting>
    </div>
  );
}

function Notifications() {
  const items = [
    ['Ticket fini', true], ['Ticket bloqué ou besoin d’action', true], ['Question d’un agent', true], ['Quota proche de la limite', true],
    ['Bascule de compte ou d’outil', true], ['Faille de sécurité trouvée', true], ['Compte rendu du jour', false],
  ] as const;
  return (
    <>
      <div className="setgroup">
        <h2>Quand me prévenir</h2>
        {items.map(([l, v]) => <Setting key={l} label={l}><LocalSwitch initial={v} label={l} /></Setting>)}
      </div>
      <div className="setgroup">
        <h2>Comment</h2>
        <Setting label="Notifications du bureau Windows"><LocalSwitch initial label="Bureau Windows" /></Setting>
        <Setting label="Regrouper les notifications" desc="Une seule notification pour plusieurs événements proches."><LocalSwitch initial label="Regrouper" /></Setting>
        <Setting label="Heures calmes" desc="Rien ne s’affiche, tout vous attend au retour."><select defaultValue="22" aria-label="Heures calmes"><option value="0">Jamais</option><option value="22">De 22 h à 8 h</option><option value="20">De 20 h à 9 h</option></select></Setting>
      </div>
    </>
  );
}

export function SettingsScreen({ tab, go, settings, update }: { tab: SettingsTab; go: Go; settings: S; update: (p: Partial<S>) => void }) {
  return (
    <div className="page settings">
      <h1>Réglages</h1>
      <p className="lead" style={{ marginBottom: 22 }}>Réglages valables pour tous les projets.</p>
      <Tabs<SettingsTab> label="Réglages" value={tab} onChange={(t) => go({ kind: 'reglages', tab: t })} tabs={[
        { id: 'connexions', label: 'Comptes et quotas' }, { id: 'quotas', label: 'Quotas et budgets' }, { id: 'securite', label: 'Sécurité' },
        { id: 'apparence', label: 'Apparence' }, { id: 'notifications', label: 'Notifications' },
      ]} />
      {tab === 'connexions' && <ComptesPanel />}
      {tab === 'quotas' && (
        <>
          <div className="setgroup">
            <h2>Tokens mesurés : Le Bon Architecte</h2>
            <RealUsage projectId="lba" />
          </div>
          <details style={{ marginTop: 28 }}>
            <summary className="muted">Exemple, pas encore branché : budgets, limites et usage par outil</summary>
            <Quotas />
          </details>
        </>
      )}
      {tab === 'securite' && <Security />}
      {tab === 'apparence' && <Appearance settings={settings} update={update} />}
      {tab === 'notifications' && <Notifications />}
    </div>
  );
}
