import db from './db.js'

const createDocuments = db.prepare(`
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        kind TEXT NOT NULL,
        meta TEXT
    )
`)

const createTerms = db.prepare(`
    CREATE TABLE IF NOT EXISTS terms (
        id INTEGER PRIMARY KEY,
        term TEXT NOT NULL,
        doc_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        FOREIGN KEY(doc_id) REFERENCES documents(id)
    )
`)

const createPostings = db.prepare(`
    CREATE TABLE IF NOT EXISTS postings (
        id INTEGER PRIMARY KEY,
        term_id INTEGER NOT NULL,
        doc_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        FOREIGN KEY(term_id) REFERENCES terms(id),
        FOREIGN KEY(doc_id) REFERENCES documents(id)
    )
`)

console.log(createPostings.run())

console.log(createDocuments.run())
console.log(createTerms.run())