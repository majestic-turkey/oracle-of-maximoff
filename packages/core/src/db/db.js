import Database from 'better-sqlite3'
import path from 'node:path'

const db = new Database(path.resolve(import.meta.dirname, '../../../../data/database.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
export default db