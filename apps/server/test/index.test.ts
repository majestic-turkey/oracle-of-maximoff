/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import Database from 'better-sqlite3'
import { Indexer } from 'core'
import { createSchema } from 'core/db/schema'
import { createApp } from '../src/index.ts'

// Builds a throwaway in-memory index via core's own schema/Indexer, the same way
// core's test suite does - so these tests never drift from the real DDL or tokenizer.
function createTestDb() {
    const db = new Database(':memory:')
    createSchema(db)
    return db
}

function seedDocument(db: Database.Database, title: string, body: string): void {
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
}

// Starts the app on an OS-assigned free port so tests never collide with a real
// dev/prod server (or each other), and tears it down afterward regardless of outcome.
async function withServer(db: Database.Database, fn: (baseUrl: string) => Promise<void>): Promise<void> {
    const app = createApp(db)
    const server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const { port } = server.address() as AddressInfo

    try {
        await fn(`http://127.0.0.1:${port}`)
    } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
    }
}

describe('GET /api/health', () => {
    test('reports ok with a sample Doc, proving the core import wired up', async () => {
        await withServer(createTestDb(), async (base) => {
            const res = await fetch(`${base}/api/health`)
            const body = await res.json()

            assert.equal(res.status, 200)
            assert.equal(body.status, 'ok')
            assert.deepEqual(body.sample, {
                id: 'simplewiki:0',
                title: 'ok',
                body: 'server can import core',
                kind: 'article',
            })
        })
    })
})

describe('GET /api/search', () => {
    test('returns results from the injected db, not the real production index', async () => {
        const db = createTestDb()
        seedDocument(db, 'Whales', 'whale ocean deep blue current tide reef coral')

        await withServer(db, async (base) => {
            const res = await fetch(`${base}/api/search?q=whale`)
            const { results } = await res.json()

            assert.equal(results.length, 1)
            assert.equal(results[0].title, 'Whales')
        })
    })

    test('a missing q defaults to an empty query rather than throwing', async () => {
        const db = createTestDb()
        seedDocument(db, 'Whales', 'whale ocean deep blue current tide reef coral')

        await withServer(db, async (base) => {
            const res = await fetch(`${base}/api/search`)
            const { results } = await res.json()

            assert.equal(res.status, 200)
            assert.deepEqual(results, [])
        })
    })

    test('topk is parsed from the query string and forwarded to search()', async () => {
        const db = createTestDb()
        for (const label of ['A', 'B', 'C']) {
            seedDocument(db, label, 'whale reef coral tide current blue')
        }

        await withServer(db, async (base) => {
            const res = await fetch(`${base}/api/search?q=whale&topk=2`)
            const { results } = await res.json()

            assert.equal(results.length, 2)
        })
    })

    test('k1 and b are parsed as floats and change the ranking, proving they reach search()', async () => {
        const db = createTestDb()
        // Equal term frequency, different lengths: with b=0 (length normalization off)
        // both score identically; with the route's default b, the shorter doc wins.
        seedDocument(db, 'Short', 'whale reef coral')
        seedDocument(db, 'Long', 'whale reef coral tide current blue deep ocean wave surf drift swell')

        await withServer(db, async (base) => {
            const defaultB = await fetch(`${base}/api/search?q=whale`).then((r) => r.json())
            const zeroB = await fetch(`${base}/api/search?q=whale&b=0`).then((r) => r.json())

            assert.notEqual(defaultB.results[0].score, defaultB.results[1].score, 'default b: scores should differ by length')
            assert.equal(zeroB.results[0].score, zeroB.results[1].score, 'b=0: scores should be equal, length ignored')
        })
    })
})
