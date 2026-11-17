import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

type Notify = (text: string) => void;
const Ctx = createContext<Notify>(() => {});
export const useNotify = () => useContext(Ctx);

// Notifications calmes : 3 au plus à l'écran, disparaissent seules, annoncées aux lecteurs d'écran.
export function NotifyProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const notify = useCallback<Notify>((text) => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list.slice(-2), { id, text }]);
    setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className="toast"><Info size={16} aria-hidden="true" />{t.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}
