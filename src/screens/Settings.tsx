import { useState } from 'react';
import { ArrowDown, ArrowUp, CircleCheck, CircleX, Plus, RefreshCw } from 'lucide-react';
import { accounts, approvals, budgets, toolInstalls, usageByDay, usageByTool } from '../mock/data';
import { TOOLS } from '../shared/contract';
import { Bar, CopyCommand, LocalSwitch, Setting, Tabs, fmtTokens, toolLabel } from '../components/ui';
import { useNotify } from '../components/notify';
import { AMBIANCES, type Settings as S, type ThemeChoice } from '../settings';
import type { Go, SettingsTab } from '../view';

function Connections() {
  const notify = useNotify();
  const [testing, setTesting] = useState<string | null>(null);
  const [order, setOrder] = useState(['Claude principal', 'Claude secondaire', 'Codex principal']);
  const move = (i: number, d: number) => setOrder((o) => { const n = [...o]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const test = (id: string) => { setTesting(id); setTimeout(() => { setTesting(null); notify('Connexion vérifiée : l’outil démarre et répond. 0 token.'); }, 900); };

  return (
    <>
      <div className="setgroup">
        <h2>Outils connectés</h2>
        <p>Le programme passe par les interfaces officielles. Il ne modifie jamais lui-même les dossiers de configuration des outils : s’il faut agir, il vous donne la commande.</p>
        {toolInstalls.map((ti) => {
          const accs = accounts.filter((a) => a.tool === ti.tool);
          const installed = ti.version !== null;
          return (
            <section key={ti.tool} className="conn" aria-label={TOOLS[ti.tool].label}>
              <div className="conn__head">
                <span className="conn__logo" aria-hidden="true">{TOOLS[ti.tool].short.slice(0, 2)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="conn__name">{TOOLS[ti.tool].label}</div>
                  <div className="conn__sub">{installed ? <>Version {ti.version}, via {ti.bridge}</> : 'Non installé sur ce PC'}</div>
                </div>
                {installed
                  ? <span className="pill pill--ok"><CircleCheck size={13} />Installé</span>
                  : <span className="pill pill--danger"><CircleX size={13} />Introuvable</span>}
              </div>

              {accs.filter((a) => a.connected).map((a) => (
                <div key={a.id} className="conn__acc">
                  <div>
                    <div style={{ fontWeight: 550, color: 'var(--text-strong)' }}>{a.label}</div>
                    <div className="xsmall muted">Abonnement {a.plan}</div>
                  </div>
                  <div>
                    <div className="meter__head"><span>5 heures</span><span className="num">{a.quota5h} %</span></div>
                    <Bar value={a.quota5h} label={`${a.label}, 5 heures`} />
                  </div>
                  <div>
                    <div className="meter__head"><span>7 jours</span><span className="num">{a.quota7d} %</span></div>
                    <Bar value={a.quota7d} label={`${a.label}, 7 jours`} />
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <span className="pill pill--ok pill--dot">Connecté</span>
                    <button className="btn btn--ghost btn--icon" aria-label={`Tester ${a.label}`} title="Tester la connexion" onClick={() => test(a.id)}>
                      <RefreshCw size={15} style={testing === a.id ? { animation: 'spin 0.9s linear infinite' } : undefined} />
                    </button>
                  </div>
                </div>
              ))}

              {!installed && accs[0]?.problem && (
                <div className="conn__problem">
                  <strong>Pourquoi :</strong> {accs[0].problem} Installez-le dans un terminal, puis cliquez sur Vérifier.
                  {accs[0].fixCommand && <CopyCommand command={accs[0].fixCommand} />}
                </div>
              )}

              <div className="conn__foot">
                {installed ? (
                  <>
                    <span>Ajouter un compte : lancez <span className="mono" style={{ color: 'var(--text)' }}>{ti.login}</span> dans un terminal.</span>
                    <span style={{ flex: 1 }} />
                    <button className="btn btn--sm" onClick={() => notify(`Maquette : le programme détecte le nouveau compte ${TOOLS[ti.tool].label} au retour.`)}><Plus size={14} />Ajouter un compte</button>
                  </>
                ) : (
                  <>
                    <span>Chemin cherché : PATH de Windows, puis dossier npm global.</span>
                    <span style={{ flex: 1 }} />
                    <button className="btn btn--sm" onClick={() => test(ti.tool)}><RefreshCw size={14} />Vérifier</button>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="setgroup">
        <h2>Bascule automatique</h2>
        <p>Quand un quota dépasse 90 % ou qu’un outil ne démarre pas, le ticket continue sur le suivant, avec sa passation. Sans IA, avec une notification.</p>
        <ol className="order">
          {order.map((o, i) => (
            <li key={o}>
              <span>{o}</span>
              <button className="btn btn--ghost btn--icon" aria-label={`Monter ${o}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
              <button className="btn btn--ghost btn--icon" aria-label={`Descendre ${o}`} disabled={i === order.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
            </li>
          ))}
        </ol>
        <Setting label="Seuil de bascule" desc="Pourcentage du quota 5 heures."><select defaultValue="90" aria-label="Seuil"><option value="80">80 %</option><option value="90">90 %</option><option value="95">95 %</option></select></Setting>
        <p className="xsmall faint" style={{ marginTop: 6 }}>Utiliser plusieurs comptes du même outil peut être encadré par ses conditions d’utilisation. Elles seront vérifiées en J3.</p>
      </div>
    </>
  );
}

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
        { id: 'connexions', label: 'Connexions' }, { id: 'quotas', label: 'Quotas et budgets' }, { id: 'securite', label: 'Sécurité' },
        { id: 'apparence', label: 'Apparence' }, { id: 'notifications', label: 'Notifications' },
      ]} />
      {tab === 'connexions' && <Connections />}
      {tab === 'quotas' && <Quotas />}
      {tab === 'securite' && <Security />}
      {tab === 'apparence' && <Appearance settings={settings} update={update} />}
      {tab === 'notifications' && <Notifications />}
    </div>
  );
}
