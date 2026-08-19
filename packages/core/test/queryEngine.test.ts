/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import Indexer from '../src/tools/indexer.ts'
import { search } from '../src/tools/queryEngine.ts'

// Mirrors packages/core/src/db/schema.js — kept independent of that module
// so these tests never touch the real on-disk database. `withIndexStats: false`
// reproduces a database indexed before index_stats existed.
function createTestDb({ withIndexStats = true } = {}) {
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
    if (withIndexStats) {
        db.exec(`
            CREATE TABLE index_stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                doc_count INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO index_stats (id, doc_count, total_tokens) VALUES (1, 0, 0);

            CREATE TRIGGER index_stats_after_document_insert
            AFTER INSERT ON documents
            BEGIN
                UPDATE index_stats
                SET doc_count = doc_count + 1,
                    total_tokens = total_tokens + COALESCE(NEW.token_count, 0)
                WHERE id = 1;
            END;

            CREATE TRIGGER index_stats_after_document_update
            AFTER UPDATE ON documents
            BEGIN
                UPDATE index_stats
                SET total_tokens = total_tokens - COALESCE(OLD.token_count, 0) + COALESCE(NEW.token_count, 0)
                WHERE id = 1;
            END;

            CREATE TRIGGER index_stats_after_document_delete
            AFTER DELETE ON documents
            BEGIN
                UPDATE index_stats
                SET doc_count = doc_count - 1,
                    total_tokens = total_tokens - COALESCE(OLD.token_count, 0)
                WHERE id = 1;
            END;
        `)
    }
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

describe('search() — snippets', () => {
    const snippetOf = (results: ReturnType<typeof search>) => results[0]?.snippet

    test('attaches a snippet with the matched term highlighted', () => {
        const db = createTestDb()
        seedDocument(db, 'Whales', 'whale ocean deep blue current tide reef coral')

        const actual = snippetOf(search(db, 'current'))
        const expected = 'whale ocean deep blue **current** tide reef coral'

        assert.equal(actual, expected, `snippet: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    })

    // Stored positions index the raw word split, *before* stopwords are dropped. If they
    // were ever recorded against the filtered token stream instead, the highlight would
    // slide left by one word per preceding stopword and land on "jumps".
    test('positions survive stopword filtering, so the highlight lands on the right word', () => {
        const db = createTestDb()
        seedDocument(db, 'Fox', 'the quick brown fox jumps over the lazy dog')

        const actual = snippetOf(search(db, 'lazy'))
        const expected = 'the quick brown fox jumps over the **lazy** dog'

        assert.equal(actual, expected, `snippet: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    })

    // The index stores stems, the body stores prose: "run" matches the posting for
    // "running", and the snippet must highlight the word as it actually appears.
    test('a stemmed query term highlights the original inflected word in the body', () => {
        const db = createTestDb()
        seedDocument(db, 'Field', 'scientists were running quickly through the field')

        const actual = snippetOf(search(db, 'run'))
        const expected = 'scientists were **running** quickly through the field'

        assert.equal(actual, expected, `snippet: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    })

    test('unions positions across query terms and windows on the cluster covering both', () => {
        const db = createTestDb()
        seedDocument(db, 'Greek', 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon')

        const actual = snippetOf(search(db, 'rho sigma'))
        const expected = '… mu nu xi omicron pi **rho** **sigma** tau upsilon'

        assert.equal(actual, expected, `snippet: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    })
})

describe('index_stats — corpus counters BM25 reads', () => {
    const readStats = (db: Database.Database) =>
        db.prepare('select doc_count, total_tokens from index_stats where id = 1').get() as {
            doc_count: number
            total_tokens: number
        }

    const directAggregate = (db: Database.Database) =>
        db.prepare('select count(*) as doc_count, coalesce(sum(token_count), 0) as total_tokens from documents').get() as {
            doc_count: number
            total_tokens: number
        }

    const assertMatchesAggregate = (db: Database.Database, when: string) => {
        const actual = readStats(db)
        const expected = directAggregate(db)
        assert.deepEqual(actual, expected, `${when}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    }

    test('the insert trigger tracks doc_count and total_tokens as documents are indexed', () => {
        const db = createTestDb()
        seedDocument(db, 'Whales', 'whale ocean deep blue current tide reef coral')
        seedDocument(db, 'Sharks', 'shark reef current tide')

        assertMatchesAggregate(db, 'after two inserts')
    })

    test('the update trigger swaps the old token_count for the new one', () => {
        const db = createTestDb()
        const docId = seedDocument(db, 'Whales', 'whale ocean deep blue current tide reef coral')

        db.prepare('update documents set token_count = ? where id = ?').run(3, docId)

        assertMatchesAggregate(db, 'after shrinking a document')
    })

    test('the delete trigger removes the document from both counters', () => {
        const db = createTestDb()
        seedDocument(db, 'Whales', 'whale ocean deep blue current tide reef coral')
        const docId = seedDocument(db, 'Sharks', 'shark reef current tide')

        // postings has a foreign key onto documents, so its rows go first
        db.prepare('delete from postings where doc_id = ?').run(docId)
        db.prepare('delete from documents where id = ?').run(docId)

        assertMatchesAggregate(db, 'after deleting one of two documents')
    })

    // Proves search() actually reads avgdl from index_stats rather than re-aggregating:
    // a doctored total_tokens has to move the length-normalization term, and therefore
    // the score, even though `documents` itself is untouched.
    test('search() takes avgdl from index_stats, not from a scan of documents', () => {
        const db = createTestDb()
        seedDocument(db, 'Whales', 'whale ocean deep blue current tide reef coral')

        const before = search(db, 'whale')[0].score
        db.prepare('update index_stats set total_tokens = total_tokens * 4 where id = 1').run()
        const after = search(db, 'whale')[0].score

        assert.notEqual(after, before, `score with a quadrupled avgdl: got ${after}, expected something other than ${before}`)

        // b=0 switches length normalization off entirely, so avgdl drops out of the
        // formula and the doctored counter must stop mattering.
        const unnormalizedBefore = search(db, 'whale', { b: 0 })[0].score
        db.prepare('update index_stats set total_tokens = total_tokens * 7 where id = 1').run()
        const unnormalizedAfter = search(db, 'whale', { b: 0 })[0].score

        closeTo(unnormalizedAfter, unnormalizedBefore, 'score with b=0 is independent of avgdl')
    })

    // The simplewiki index predates index_stats and is too expensive to rebuild, so
    // search() has to stay correct against a database that has no such table.
    test('scores are identical on a database with no index_stats table', () => {
        const withStats = createTestDb()
        const withoutStats = createTestDb({ withIndexStats: false })
        for (const db of [withStats, withoutStats]) {
            seedDocument(db, 'Whales', 'whale whale ocean deep blue current tide reef coral')
            seedDocument(db, 'Sharks', 'shark reef current tide wave surf blue deep')
        }

        const expected = search(withStats, 'whale')
        const actual = search(withoutStats, 'whale')

        assert.equal(actual.length, expected.length, `result count: got ${actual.length}, expected ${expected.length}`)
        closeTo(actual[0].score, expected[0].score, 'fallback score')
        assert.equal(actual[0].snippet, expected[0].snippet, `fallback snippet: got ${JSON.stringify(actual[0].snippet)}, expected ${JSON.stringify(expected[0].snippet)}`)
    })
})
