// Base locale SQLite intégrée à Node (rien à compiler). Le journal d'événements est la seule source de vérité ;
// la table « tickets » n'est qu'une vue recalculable à tout moment.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BACKUP = /^lba-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.db$/;
const BACKUP_EVERY = 3_600_000; // au plus une par heure : les redémarrages répétés n'effacent pas les bonnes
const BACKUP_KEEP = 10;

// Sauvegarde simple de l'état de l'outil : une copie cohérente de la base dans .lba/sauvegardes.
// Copie d'abord dans un fichier temporaire : une panne en plein milieu ne laisse jamais de sauvegarde abîmée.
export function backupDb(db: DatabaseSync, dir: string, now = new Date()): string | undefined {
  mkdirSync(dir, { recursive: true });
  const list = () => readdirSync(dir).filter((f) => BACKUP.test(f)).sort();
  const last = list().at(-1)?.match(BACKUP);
  if (last && now.getTime() - Date.parse(`${last[1]}T${last[2]}:${last[3]}:${last[4]}Z`) < BACKUP_EVERY) return undefined;
  const file = join(dir, `lba-${now.toISOString().slice(0, 19).replaceAll(':', '-')}.db`);
  const tmp = `${file}.tmp`;
  rmSync(tmp, { force: true });
  db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
  renameSync(tmp, file);
  for (const old of list().slice(0, -BACKUP_KEEP)) rmSync(join(dir, old), { force: true });
  return file;
}

export function openDb(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL, project TEXT NOT NULL, ticket TEXT,
      type TEXT NOT NULL, actor TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS events_ticket ON events(ticket);
    CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, project TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}
