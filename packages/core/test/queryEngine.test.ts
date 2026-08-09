/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import Indexer from '../src/tools/indexer.ts'
import { search } from '../src/tools/queryEngine.ts'

// Mirrors packages/core/src/db/schema.js — kept independent of that module
// so these tests never touch the real on-disk database.
function createTestDb() {
    const db = new Database(':memory:')
    db.exec(`
        CREATE TABLE documents (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            kind TEXT NOT NULL,
            meta TEXT,
            token_count INTEGER,
            external_id TEXT NOT NULL UNIQUE
        );
        CREATE TABLE terms (
            id INTEGER PRIMARY KEY,
            term TEXT NOT NULL UNIQUE
        );
        CREATE TABLE postings (
            id INTEGER PRIMARY KEY,
            term_id INTEGER NOT NULL REFERENCES terms(id),
            doc_id INTEGER NOT NULL REFERENCES documents(id),
            frequency INTEGER NOT NULL,
            positions TEXT,
            UNIQUE(term_id, doc_id)
        );
    `)
    return db
}

// Ingests one document the same way src/db/ingest.js does: tokenize with the
// real Indexer (shared tokenizer pipeline), then write documents/terms/postings.
function seedDocument(db: Database.Database, title: string, body: string): number {
    const indexer = new Indexer()
    const tokens = indexer.analyze(body)

    const insertDoc = db.prepare(`
        INSERT INTO documents (title, body, kind, token_count, external_id)
        VALUES (?, ?, 'article', ?, ?)
    `)
    const docId = Number(insertDoc.run(title, body, tokens.length, title).lastInsertRowid)

    const indices = indexer.buildIndex(tokens, docId)
    const upsertTerm = db.prepare(`
        INSERT INTO terms (term) VALUES (?)
        ON CONFLICT(term) DO UPDATE SET term = term
        RETURNING id
    `)
    const insertPosting = db.prepare(`
        INSERT INTO postings (term_id, doc_id, frequency, positions) VALUES (?, ?, ?, ?)
    `)
    for (const { token, positions } of indices) {
        const { id: termId } = upsertTerm.get(token) as { id: number }
        insertPosting.run(termId, docId, positions.length, JSON.stringify(positions))
    }
    return docId
}

// Independent re-implementation of Okapi BM25, used as an oracle to check
// queryEngine's formula against — not a copy of its internals.
function bm25(tf: number, df: number, n: number, docLen: number, avgdl: number, k1: number, b: number): number {
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
    return idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgdl)))
}

const closeTo = (actual: number, expected: number, msg: string) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: got ${actual}, expected ${expected}`)

describe('search() — matching', () => {
    test('returns only documents that contain a query term', () => {
        const db = createTestDb()
        const whaleDoc = seedDocument(db, 'Whales', 'whale ocean deep blue current tide reef coral')
        seedDocument(db, 'Sharks', 'shark reef current tide wave surf blue deep')

        const results = search(db, 'whale')

        assert.equal(results.length, 1)
        assert.equal(results[0].docId, whaleDoc)
    })

    test('returns an empty array when no document contains the query term', () => {
        const db = createTestDb()
        seedDocument(db, 'Sharks', 'shark reef current tide wave surf blue deep')

        assert.deepEqual(search(db, 'whale'), [])
    })

    test('stopwords in the query are filtered out, same as at index time', () => {
        const db = createTestDb()
        const whaleDoc = seedDocument(db, 'Whales', 'whale ocean deep blue current tide reef coral')

        const results = search(db, 'the whale')

        assert.equal(results.length, 1)
        assert.equal(results[0].docId, whaleDoc)
    })
})

describe('search() — BM25 scoring matches the textbook formula', () => {
    test('single-term score equals an independently computed BM25 value', () => {
        const db = createTestDb()
        // Equal length docs (10 tokens each) keeps the length-normalization
        // term neutral (docLen / avgdl === 1), isolating tf/idf.
        const whaleDoc = seedDocument(db, 'Whales', 'whale whale whale ocean deep blue current tide reef coral')
        seedDocument(db, 'Sharks', 'shark reef current tide wave surf blue deep coral ocean')

        const results = search(db, 'whale', { k1: 1.2, b: 0.75 })

        assert.equal(results.length, 1)
        // tf=3 for "whale" in doc 1, df=1 (only doc 1 has it), n=2 docs, docLen=avgdl=10
        const expected = bm25(3, 1, 2, 10, 10, 1.2, 0.75)
        closeTo(results[0].score, expected, 'BM25 score')
        assert.equal(results[0].docId, whaleDoc)
    })
})

describe('search() — length normalization', () => {
    test('same term frequency, shorter document ranks higher', () => {
        const db = createTestDb()
        const shortDoc = seedDocument(db, 'Short', 'whale reef coral')
        const longDoc = seedDocument(db, 'Long', 'whale reef coral tide current blue deep ocean wave surf drift swell foam mist spray')

        const results = search(db, 'whale')

        assert.equal(results.length, 2)
        assert.equal(results[0].docId, shortDoc)
        assert.equal(results[1].docId, longDoc)
        assert.ok(results[0].score > results[1].score)
    })
})

describe('search() — multi-term queries accumulate score across terms', () => {
    test('a document matching both query terms outranks one matching only one', () => {
        const db = createTestDb()
        const bothDoc = seedDocument(db, 'Both', 'whale reef whale reef coral tide current blue')
        const oneDoc = seedDocument(db, 'One', 'whale coral tide current blue deep ocean surf')

        const results = search(db, 'whale reef')

        assert.equal(results.length, 2)
        assert.equal(results[0].docId, bothDoc)
        assert.equal(results[1].docId, oneDoc)
        assert.ok(results[0].score > results[1].score)
    })
})

describe('search() — result ordering and topK', () => {
    test('results are sorted by score, descending', () => {
        const db = createTestDb()
        seedDocument(db, 'A', 'whale reef coral tide')
        seedDocument(db, 'B', 'whale whale reef coral tide')
        seedDocument(db, 'C', 'whale whale whale reef coral tide')

        const results = search(db, 'whale')

        for (let i = 1; i < results.length; i++) {
            assert.ok(results[i - 1].score >= results[i].score)
        }
    })

    test('never returns more than topK results', () => {
        const db = createTestDb()
        for (const label of ['A', 'B', 'C', 'D', 'E']) {
            seedDocument(db, label, 'whale reef coral tide current blue')
        }

        const results = search(db, 'whale', { topK: 2 })

        assert.equal(results.length, 2)
    })
})
