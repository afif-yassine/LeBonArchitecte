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
  creer: ['--titre T --attendu A [--pourquoi P] [--criteres "a|b"] [--deps "LBA-1,LBA-2"] [--lot n] [--modele Opus|Sonnet|Haiku] [--depuis B-n] [--role id]', 'nouveau ticket (plan à valider) ; --depuis : il vient du backlog, qu’il quitte ; --role : fiche de rôle (voir equipe)'],
  equipe: ['', 'les fiches de rôle : mission, quand le rôle est appelé, ce qu’il peut faire'],
  backlog: ['', 'le backlog : idées et besoins pas encore décidés, dans l’ordre'],
  'backlog-ajouter': ['--titre T [--detail D] [--taille S|M|L] [--exigences "E3,E5"]', 'ajouter un morceau ou une idée au backlog, relié aux exigences du cahier'],
  'backlog-modifier': ['<B-n> [--titre T] [--detail D] [--taille S|M|L] [--exigences "E3,E5"]', 'modifier un élément (à venir ou dans le sprint)'],
  'backlog-placer': ['<B-n> <place>', 'changer sa place dans le backlog (1 = en tête)'],
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
      criteria: list(opts.criteres), deps: list(opts.deps), lot: opts.lot ? Number(opts.lot) : undefined, model: opts.modele, from: opts.depuis, role: opts.role,
    }));
  },
  async backlog() {
    const b = await api('GET', `/projects/${PROJECT}/backlog`);
    const it = (x) => `${x.id}${x.size ? ` [${x.size}]` : ''} ${x.title}${x.refs?.length ? ` (exigences ${x.refs.join(', ')})` : ''}${x.detail ? ` : ${x.detail.slice(0, 160)}` : ''}`;
    console.log(`Cahier : ${b.coverage.covered}/${b.coverage.total} exigences couvertes${b.coverage.missing.length ? ` ; sans rien : ${b.coverage.missing.map((m) => `${m.id} ${m.title}`).join(', ')}` : ''}.`);
    if (b.changes?.changed) console.log(`CHANGEMENT depuis la dernière fois : exigences ajoutées ${b.changes.added.join(', ') || '—'}, modifiées ${b.changes.modified.join(', ') || '—'}, enlevées ${b.changes.removed.join(', ') || '—'}, décisions ${b.changes.decisions.join(', ') || '—'}.`);
    if (b.sprint) { console.log(`Sprint ${b.sprint.n} ouvert : ${b.sprint.objectif}`); for (const x of b.sprint.elements) console.log(`  ${it(x)} → tickets : ${x.tickets.map((t) => `${t} (${b.status[t] ?? '?'})`).join(', ') || 'pas encore découpé'}`); }
    else console.log(`Aucun sprint ouvert (le prochain sera le sprint ${b.nextSprint}).`);
    console.log(b.items.length ? 'À venir, dans l’ordre :' : 'Rien à venir.');
    b.items.forEach((x, i) => console.log(`  ${i + 1}. ${it(x)}`));
    if (b.done.length) console.log(`Faits : ${b.done.map((x) => `${x.id} → ${x.tickets.join(', ')}`).join(' ; ')}`);
  },
  async equipe() {
    const e = await api('GET', `/projects/${PROJECT}/equipe`);
    for (const r of e.roles) console.log(`${r.id}${r.actif ? '' : ' (inactif)'} : ${r.nom}${r.modele ? `, ${r.modele}` : ''}. ${r.mission}${r.mots?.length ? ` Appelé pour : ${r.mots.join(', ')}.` : ''}${r.ecrire?.length ? ` Écrit seulement dans : ${r.ecrire.join(', ')}.` : ''}`);
  },
  async 'backlog-ajouter'() { say(await api('POST', `/projects/${PROJECT}/backlog`, { title: need(opts.titre, '--titre'), detail: opts.detail, size: opts.taille, refs: list(opts.exigences) })); },
  async 'backlog-modifier'() {
    const body = Object.fromEntries(Object.entries({ title: opts.titre, detail: opts.detail, size: opts.taille, refs: opts.exigences === undefined ? undefined : list(opts.exigences) }).filter(([, v]) => v !== undefined));
    say(await api('PATCH', `/projects/${PROJECT}/backlog/${need(args[0], 'l’id B-n')}`, body));
  },
  async 'backlog-placer'() { say(await api('POST', `/projects/${PROJECT}/backlog/${need(args[0], 'l’id B-n')}/ordre`, { to: Number(need(args[1], 'la place')) - 1 })); },
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
