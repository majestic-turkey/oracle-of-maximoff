import db from './db.js'


const createDocuments = db.prepare(`
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        kind TEXT NOT NULL,
        meta TEXT,
        token_count INTEGER,
        external_id TEXT NOT NULL UNIQUE
    )
`)

const createTerms = db.prepare(`
        CREATE TABLE IF NOT EXISTS terms (
        id INTEGER PRIMARY KEY,
        term TEXT NOT NULL UNIQUE
    )
`)

const createPostings = db.prepare(`
    CREATE TABLE IF NOT EXISTS postings (
        id INTEGER PRIMARY KEY,
        term_id INTEGER NOT NULL references terms(id),
        doc_id INTEGER NOT NULL references documents(id),
        frequency INTEGER NOT NULL,
        positions TEXT,
        UNIQUE(term_id, doc_id)
    )
`)

console.log(createDocuments.run())
console.log(createTerms.run())
console.log(createPostings.run())

const addDocument = db.prepare(`
    INSERT INTO documents (title, body, kind, meta, token_count, external_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
        title = excluded.title,
        body = excluded.body,
        kind = excluded.kind,
        meta = excluded.meta,
        token_count = excluded.token_count
`)