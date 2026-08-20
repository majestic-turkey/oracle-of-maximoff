import Database from 'better-sqlite3'
import path from 'node:path'
import { createSchema } from './schema.js'

const db = new Database(path.resolve(import.meta.dirname, '../../../../data/database.sqlite'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documents'").get()) {
    console.log('Creating database schema')
    createSchema(db)
}
export default db


let statsQuery

export function stats() {
    if (!statsQuery) {
        statsQuery = db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM terms) AS termCount,
                (SELECT COUNT(*) FROM postings) AS postingCount,
                (SELECT AVG(token_count) FROM documents) AS avgDocLength
        `)
    }
    return statsQuery.get()
}