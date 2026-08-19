/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { createSchema, refreshIndexStats, refreshDocLengths } from '../src/db/schema.js'

// These tests only care about token_count and the tables index_stats/doc_lengths
// derive from it, so a bare INSERT stands in for a real ingest.
function insertDoc(db: Database.Database, externalId: string, tokenCount: number): number {
    const { lastInsertRowid } = db.prepare(`
        INSERT INTO documents (title, body, kind, token_count, external_id)
        VALUES (?, 'body', 'article', ?, ?)
    `).run(externalId, tokenCount, externalId)
    return Number(lastInsertRowid)
}

const directAggregate = (db: Database.Database) =>
    db.prepare('select count(*) as doc_count, coalesce(sum(token_count), 0) as total_tokens from documents').get() as {
        doc_count: number
        total_tokens: number
    }

describe('refreshIndexStats() — backfilling a database that predates index_stats', () => {
    test('recomputes counters for documents that were already indexed before the table existed', () => {
        const db = new Database(':memory:')
        createSchema(db)
        db.exec(`
            DROP TRIGGER index_stats_after_document_insert;
            DROP TRIGGER index_stats_after_document_update;
            DROP TRIGGER index_stats_after_document_delete;
            DROP TABLE index_stats;
        `)

        insertDoc(db, 'a', 10)
        insertDoc(db, 'b', 25)
        insertDoc(db, 'c', 7)

        // Simulates the actual upgrade path: re-running createSchema puts index_stats back
        // (seeded at 0/0) with its triggers, but the triggers only see writes from here on
        // - the three documents already sitting in the table are invisible to them.
        createSchema(db)
        refreshIndexStats(db)

        const actual = db.prepare('select doc_count, total_tokens from index_stats where id = 1').get()
        assert.deepEqual(actual, directAggregate(db), `index_stats: got ${JSON.stringify(actual)}, expected ${JSON.stringify(directAggregate(db))}`)
    })

    test('is idempotent - re-running it against an already-correct table changes nothing', () => {
        const db = new Database(':memory:')
        createSchema(db)
        insertDoc(db, 'a', 10)
        insertDoc(db, 'b', 25)

        refreshIndexStats(db)
        const actual = db.prepare('select doc_count, total_tokens from index_stats where id = 1').get()
        assert.deepEqual(actual, directAggregate(db), `index_stats: got ${JSON.stringify(actual)}, expected ${JSON.stringify(directAggregate(db))}`)
    })
})

describe('refreshDocLengths() — backfilling a database that predates doc_lengths', () => {
    test('recomputes rows for documents that were already indexed before the table existed', () => {
        const db = new Database(':memory:')
        createSchema(db)
        db.exec(`
            DROP TRIGGER doc_lengths_after_document_insert;
            DROP TRIGGER doc_lengths_after_document_update;
            DROP TRIGGER doc_lengths_after_document_delete;
            DROP TABLE doc_lengths;
        `)

        insertDoc(db, 'a', 10)
        insertDoc(db, 'b', 25)

        createSchema(db)
        refreshDocLengths(db)

        const actual = db.prepare('select doc_id, token_count from doc_lengths order by doc_id').all()
        const expected = db.prepare('select id as doc_id, coalesce(token_count, 0) as token_count from documents order by id').all()
        assert.deepEqual(actual, expected, `doc_lengths: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    })

    test('is idempotent - re-running it against an already-correct table changes nothing', () => {
        const db = new Database(':memory:')
        createSchema(db)
        insertDoc(db, 'a', 10)
        insertDoc(db, 'b', 25)

        refreshDocLengths(db)
        const actual = db.prepare('select doc_id, token_count from doc_lengths order by doc_id').all()
        const expected = db.prepare('select id as doc_id, coalesce(token_count, 0) as token_count from documents order by id').all()
        assert.deepEqual(actual, expected, `doc_lengths: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    })
})
