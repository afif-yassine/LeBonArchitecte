// État partagé de l'interface. Les tickets et le pilote viennent du moteur local (/api).
// Si le moteur est arrêté, l'interface le dit et reste en lecture seule sur les données de démonstration.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { autopilotDefaults, humanActions, reports as initialReports, tickets as demoTickets } from './mock/data';
import type { DailyReport, HumanAction, Ticket } from './shared/contract';
import { useNotify } from './components/notify';

type Autopilot = typeof autopilotDefaults;

interface Store {
  online: boolean;
  tickets: Ticket[];
  reports: DailyReport[];
  autopilot: Autopilot;
  setAutopilot: (p: Partial<Autopilot>) => void;
  isReady: (t: Ticket) => boolean;
  queue: (projectId: string) => Ticket[];
  running: (projectId: string) => Ticket[];
  launch: (id: string, replaceId?: string) => void;
  stop: (id: string) => void;
  finish: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  unreported: (projectId: string) => Ticket[];
  writeReport: (projectId: string) => void;
  validate: (id: string) => void;
  reject: (id: string, problem: string) => void;
  actions: (projectId: string) => HumanAction[];
  resolveAction: (id: string, label: string) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { message?: string }).message ?? `Erreur ${r.status}`);
  return j as T;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const notify = useNotify();
  const [online, setOnline] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>(demoTickets);
  const [reports, setReports] = useState<DailyReport[]>(initialReports);
  const [autopilot, setAuto] = useState<Autopilot>(autopilotDefaults);
  const [pending, setPending] = useState<HumanAction[]>(humanActions);

  const reload = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([api<Ticket[]>('/tickets'), api<Autopilot>('/pilot')]);
      setTickets(t);
      setAuto(p);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  // Flux en direct : le moteur prévient à chaque changement, on relit.
  useEffect(() => {
    reload();
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/stream');
      es.onmessage = () => { reload(); };
      es.onerror = () => setOnline(false);
    } catch { /* pas de flux : on garde la lecture simple */ }
    return () => es?.close();
  }, [reload]);

  // Toute action passe par le moteur ; ses refus arrivent avec une explication en clair.
  const act = useCallback(async (path: string, body?: unknown) => {
    if (!online) { notify('Le moteur est arrêté : lancez « npm run dev » pour agir. L’écran montre des données de démonstration.'); return; }
    try {
      const r = await api<{ message?: string }>(path, 'POST', body ?? {});
      if (r.message) notify(r.message);
    } catch (e) {
      notify((e as Error).message);
    }
  }, [online, notify]);

  const isReady = useCallback((t: Ticket) => t.deps.every((d) => tickets.find((x) => x.id === d)?.status === 'termine'), [tickets]);
  const queue = useCallback((pid: string) => tickets.filter((t) => t.projectId === pid && t.status === 'a-faire').sort((a, b) => a.priority - b.priority), [tickets]);
  const running = useCallback((pid: string) => tickets.filter((t) => t.projectId === pid && t.status === 'en-cours'), [tickets]);
  const unreported = useCallback((pid: string) => tickets.filter((t) => t.projectId === pid && (t.status === 'termine' || t.status === 'a-tester') && !t.reportedIn), [tickets]);

  const launch = useCallback((id: string, replaceId?: string) => { act(`/tickets/${id}/launch`, { replace: replaceId }); }, [act]);
  const stop = useCallback((id: string) => { act(`/tickets/${id}/stop`); }, [act]);
  const finish = useCallback((id: string) => { act(`/tickets/${id}/simulate-done`, { result: 'ok' }); }, [act]);
  const validate = useCallback((id: string) => {
    act(`/tickets/${id}/validate`);
    setPending((l) => l.filter((a) => a.ticketId !== id || a.kind !== 'reunion'));
  }, [act]);
  const reject = useCallback((id: string, problem: string) => {
    act(`/tickets/${id}/reject`, { problem });
    setPending((l) => l.filter((a) => a.ticketId !== id || a.kind !== 'reunion'));
  }, [act]);

  // Priorité dans la file : encore locale (J2 la mettra dans le moteur).
  const move = useCallback((id: string, dir: -1 | 1) => {
    setTickets((l) => {
      const t = l.find((x) => x.id === id)!;
      const q = l.filter((x) => x.projectId === t.projectId && x.status === 'a-faire').sort((a, b) => a.priority - b.priority);
      const other = q[q.findIndex((x) => x.id === id) + dir];
      if (!other) return l;
      return l.map((x) => (x.id === id ? { ...x, priority: other.priority } : x.id === other.id ? { ...x, priority: t.priority } : x));
    });
  }, []);

  const writeReport = useCallback(async (pid: string) => {
    const list = unreported(pid);
    if (list.length === 0) { notify('Rien de nouveau depuis le dernier compte rendu.'); return; }
    if (!online) { notify('Le moteur est arrêté : le compte rendu ne peut pas être écrit.'); return; }
    const id = `CR-${15 + reports.length - initialReports.length}`;
    try {
      const r = await api<{ tickets: string[] }>(`/projects/${pid}/report`, 'POST', { reportId: id });
      const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      setReports((l) => [{
        id, date, tickets: r.tickets,
        done: list.map((t) => `${t.id} ${t.title}`),
        inProgress: running(pid).map((t) => `${t.id} ${t.title}`),
        blocked: tickets.filter((t) => t.projectId === pid && t.status === 'action').map((t) => `${t.id} ${t.title}`),
        tokens: 38000, waiting: pending.filter((a) => a.projectId === pid).map((a) => a.title),
      }, ...l]);
      notify(`${id} écrit par le programme : ${r.tickets.length} tickets rapportés, sans doublon.`);
    } catch (e) { notify((e as Error).message); }
  }, [unreported, online, reports.length, running, tickets, pending, notify]);

  const setAutopilot = useCallback(async (p: Partial<Autopilot>) => {
    if (!online) { notify('Le moteur est arrêté : le réglage du pilote ne peut pas être enregistré.'); return; }
    try {
      setAuto(await api<Autopilot>('/pilot', 'PUT', p));
      if (p.on !== undefined) notify(p.on ? 'Pilote automatique activé : quand un ticket est fini, le suivant prêt démarre.' : 'Pilote automatique coupé : vous lancez les tickets vous-même.');
    } catch (e) { notify((e as Error).message); }
  }, [online, notify]);

  const actions = useCallback((pid: string) => pending.filter((a) => a.projectId === pid), [pending]);
  const resolveAction = useCallback((id: string, label: string) => {
    setPending((l) => l.filter((a) => a.id !== id));
    notify(`« ${label} » : c’est fait. Le ticket reprend seul.`);
  }, [notify]);

  const value = useMemo(() => ({ online, tickets, reports, autopilot, setAutopilot, isReady, queue, running, launch, stop, finish, move, unreported, writeReport, validate, reject, actions, resolveAction }),
    [online, tickets, reports, autopilot, setAutopilot, isReady, queue, running, launch, stop, finish, move, unreported, writeReport, validate, reject, actions, resolveAction]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
