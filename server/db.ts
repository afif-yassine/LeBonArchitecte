// Base locale SQLite intégrée à Node (rien à compiler). Le journal d'événements est la seule source de vérité ;
// la table « tickets » n'est qu'une vue recalculable à tout moment.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
