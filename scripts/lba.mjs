// Commande `lba` : la main de l'Architecte sur le projet (kanban, tickets, agents, documents).
// Elle passe par le moteur local, comme vos boutons ; chaque action est écrite au nom de l'Architecte
// et les portes qui restent au propriétaire (Valider, git, budget, supprimer) sont refusées par le serveur.
// Sortie courte et en texte : elle est lue par un agent, chaque ligne coûte des tokens.
// Usage : node scripts/lba.mjs aide
const BASE = process.env.LBA_URL ?? 'http://127.0.0.1:4317';
const PROJECT = process.env.LBA_PROJET ?? 'lba';
const [cmd = 'aide', ...rest] = process.argv.slice(2);

// Options « --nom valeur » et arguments libres.
const opts = {}; const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) opts[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') || rest[i + 1] === undefined ? 'oui' : rest[++i];
  else args.push(rest[i]);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method, headers: { 'x-lba-acteur': 'architecte', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(typeof data === 'object' ? data.message : String(data));
  return data;
}
const need = (v, what) => { if (!v) throw new Error(`Il manque ${what}. Voir : node scripts/lba.mjs aide`); return v; };
const list = (s) => (s ? String(s).split(/[|,;]/).map((x) => x.trim()).filter(Boolean) : []);
const say = (r) => console.log(r?.message ?? r);
const STATUS = { 'a-faire': 'À faire', 'en-cours': 'En cours', action: 'Besoin d’action', 'a-tester': 'À tester', termine: 'Fini' };
// done : ids des tickets finis (une dépendance finie n'est plus « attendue »).
const line = (t, done = new Set()) => {
  const wait = (t.deps ?? []).filter((d) => !done.has(d));
  return `${t.id} [${t.model}] ${t.title}${t.paused ? ' (en pause)' : ''}${t.status === 'a-faire' && !t.planOk ? ' (plan à valider)' : ''}${wait.length && t.status === 'a-faire' ? ` (attend ${wait.join(', ')})` : ''}${t.needAction ? ` : ${t.needAction.slice(0, 120)}` : ''}`;
};

const COMMANDS = {
  aide: ['', 'cette aide'],
  etat: ['', 'le kanban, le pilote et le budget du jour'],
  ticket: ['<id>', 'un ticket : plan, critères, ce qui bloque, derniers messages'],
  deroule: ['<id> [n]', 'les n derniers moments du direct (20 par défaut)'],
  'compte-rendu': ['<id>', 'le compte rendu mesuré du ticket'],
  creer: ['--titre T --attendu A [--pourquoi P] [--criteres "a|b"] [--deps "LBA-1,LBA-2"] [--lot n] [--modele Opus|Sonnet|Haiku]', 'nouveau ticket (plan à valider)'],
  'valider-plan': ['<id> [id…]', 'valider des plans : le pilote pourra les lancer'],
  replanifier: ['<id>', 'refaire le plan d’un ticket à faire'],
  lancer: ['<id>', 'lancer un agent sur le ticket'],
  pause: ['<id>', 'mettre en pause (travail et conversation gardés)'],
  reprendre: ['<id>', 'reprendre un ticket en pause ou interrompu'],
  arreter: ['<id>', 'arrêter l’agent'],
  resoudre: ['<id>', '« Besoin d’action » : l’agent résout (conflit, tests rouges)'],
  tester: ['<id>', 'lancer les tests dans la branche du ticket'],
  message: ['<id> <texte>', 'écrire à l’agent du ticket'],
  refuser: ['<id> <problème>', 'à tester : « Ça ne marche pas », l’agent corrige'],
  ordre: ['<id> tete|monter|descendre', 'changer la place dans la file du pilote'],
  docs: ['', 'la liste des documents du projet'],
  doc: ['<chemin>', 'lire un document'],
  carte: ['<nom> [nom2]', 'carte du code : où est un élément et qui l’utilise (réponse courte) ; avec 2 noms, le chemin entre eux'],
};

const run = {
  async aide() {
    console.log('Commande lba (Architecte). Réservé au propriétaire : Valider (réunir dans main), git, budget, supprimer.');
    for (const [c, [a, d]] of Object.entries(COMMANDS)) console.log(`  ${c}${a ? ` ${a}` : ''} : ${d}`);
  },
  async etat() {
    const [ts, pilot] = await Promise.all([api('GET', '/tickets'), api('GET', '/pilot')]);
    const mine = ts.filter((t) => t.projectId === PROJECT);
    console.log(`Pilote ${pilot.on ? 'allumé' : 'coupé'}, ${pilot.maxParallel} en parallèle au plus. Budget du jour : ${Math.round(pilot.spentToday / 1000)} k sur ${Math.round(pilot.dayBudget / 1000)} k${pilot.budgetHit ? ' (atteint : rien ne part)' : ''}.`);
    for (const s of ['action', 'en-cours', 'a-tester', 'a-faire', 'termine']) {
      const col = mine.filter((t) => t.status === s).sort((a, b) => a.priority - b.priority);
      if (!col.length) continue;
      console.log(`${STATUS[s]} (${col.length})`);
      const done = new Set(mine.filter((t) => t.status === 'termine').map((t) => t.id));
      for (const t of s === 'termine' ? col.slice(-5) : col) console.log(`  ${line(t, done)}`);
      if (s === 'termine' && col.length > 5) console.log(`  … et ${col.length - 5} autres`);
    }
  },
  async ticket() {
    const id = need(args[0], 'l’id du ticket');
    const t = (await api('GET', '/tickets')).find((x) => x.id === id);
    if (!t) throw new Error(`Ticket ${id} introuvable.`);
    console.log(`${t.id} : ${t.title}\nÉtat : ${STATUS[t.status]}${t.paused ? ', en pause' : ''}. Modèle ${t.model}. Lot ${t.lot}. Tokens : ${Math.round(t.used / 1000)} k.`);
    if (t.needAction) console.log(`Bloque : ${t.needAction}`);
    console.log(`Pourquoi : ${t.description.context || '—'}\nAttendu : ${t.description.expected}`);
    console.log('Critères :'); for (const c of t.criteria) console.log(`  [${c.done ? 'x' : ' '}] ${c.text}`);
    console.log(`Plan${t.planOk ? ' (validé)' : ' (à valider)'} :`); t.steps.forEach((s, i) => console.log(`  ${i + 1}. [${s.state}] ${s.label}`));
    if (t.deps?.length) console.log(`Dépend de : ${t.deps.join(', ')}`);
  },
  async deroule() {
    const id = need(args[0], 'l’id du ticket');
    const feed = await api('GET', `/tickets/${id}/live`);
    for (const i of feed.slice(-(Number(args[1]) || 20))) console.log(`${i.at.slice(11, 16)} ${i.who} ${i.kind}${i.ok === false ? ' ✗' : i.ok ? ' ✓' : ''} : ${String(i.text).slice(0, 200)}`);
  },
  async 'compte-rendu'() {
    const r = await api('GET', `/tickets/${need(args[0], 'l’id du ticket')}/report`);
    console.log(`${r.id} : ${r.heavy.length ? `lourd (${r.heavy.join(', ')})` : 'léger'}. ${Math.round(r.calls.tokens / 1000)} k tokens, ${r.calls.minutes} min, ${r.calls.passes} passage(s).`);
    console.log(`Tests : ${r.tests.map((x) => `${x.kind} ${x.ok ? 'verts' : 'en échec'} (${x.result})`).join(' ; ') || 'aucun'}`);
    if (r.unverified?.length) console.log(`Non vérifié d’après l’agent : ${r.unverified.join(' / ')}`);
    if (r.calls.problems.length) console.log(`Problèmes : ${r.calls.problems.join(' / ')}`);
  },
  async creer() {
    say(await api('POST', `/projects/${PROJECT}/tickets`, {
      title: need(opts.titre, '--titre'), expected: need(opts.attendu, '--attendu'), context: opts.pourquoi,
      criteria: list(opts.criteres), deps: list(opts.deps), lot: opts.lot ? Number(opts.lot) : undefined, model: opts.modele,
    }));
  },
  async 'valider-plan'() { say(await api('POST', `/projects/${PROJECT}/plans/validate`, { ids: args.length ? args : need(null, 'au moins un id') })); },
  async replanifier() { say(await api('POST', `/tickets/${need(args[0], 'l’id')}/plan/redo`, {})); },
  async lancer() { say(await api('POST', `/tickets/${need(args[0], 'l’id')}/launch`, { who: 'architecte' })); },
  async pause() { say(await api('POST', `/tickets/${need(args[0], 'l’id')}/pause`, {})); },
  async reprendre() { say(await api('POST', `/tickets/${need(args[0], 'l’id')}/resume`, {})); },
  async arreter() { say(await api('POST', `/tickets/${need(args[0], 'l’id')}/stop`, {})); },
  async resoudre() { say(await api('POST', `/tickets/${need(args[0], 'l’id')}/fix`, {})); },
  async tester() { say(await api('POST', `/tickets/${need(args[0], 'l’id')}/test`, {})); },
  async message() { say(await api('POST', `/tickets/${need(args[0], 'l’id')}/message`, { text: need(args.slice(1).join(' '), 'le texte') })); },
  async refuser() { say(await api('POST', `/tickets/${need(args[0], 'l’id')}/reject`, { problem: need(args.slice(1).join(' '), 'le problème') })); },
  async ordre() {
    const dir = { tete: 'tete', monter: -1, descendre: 1 }[need(args[1], 'tete, monter ou descendre')];
    if (dir === undefined) throw new Error('Ordre : tete, monter ou descendre.');
    say(await api('POST', `/tickets/${need(args[0], 'l’id')}/priority`, { dir }));
  },
  async docs() { for (const d of await api('GET', `/projects/${PROJECT}/docs`)) if (!d.path.endsWith('.pdf')) console.log(`${d.path} : ${d.title}`); },
  async carte() {
    const q = new URLSearchParams({ q: need(args[0], 'un nom (fonction, fichier, composant)'), ...(args[1] ? { to: args[1] } : {}) });
    console.log((await api('GET', `/projects/${PROJECT}/carte?${q}`)).text);
  },
  async doc() { console.log((await api('GET', `/projects/${PROJECT}/doc?path=${encodeURIComponent(need(args[0], 'le chemin'))}`)).content); },
};

if (!run[cmd]) { console.error(`Commande inconnue : ${cmd}. Voir : node scripts/lba.mjs aide`); process.exit(2); }
run[cmd]().catch((err) => { console.error(`Refusé : ${err.message}`); process.exit(1); });
