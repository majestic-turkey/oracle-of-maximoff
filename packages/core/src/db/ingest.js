import db from './db.js'
import Indexer from '../tools/indexer.ts'
import { filesCorpus } from '../corpora/files.ts'
import { createSchema } from './schema.js'

const indexer = new Indexer();

const ingestDocument = db.prepare(`
    INSERT INTO documents (title, body, kind, meta, token_count, external_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
        title = excluded.title,
        body = excluded.body,
        kind = excluded.kind,
        meta = excluded.meta,
        token_count = excluded.token_count
    RETURNING id
`)

const ingestPosting = db.prepare(`
    INSERT INTO postings (term_id, doc_id, frequency, positions)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(term_id, doc_id) DO UPDATE SET
        frequency = excluded.frequency,
        positions = excluded.positions
`)

const upsertTerm = db.prepare(`
    INSERT INTO terms (term)
    VALUES (?)
    ON CONFLICT(term) DO UPDATE SET term = term
    RETURNING id
`)

const ingestBatch = db.transaction((docs) => {
    for (const doc of docs) {
        const rawTokens = indexer.analyze(doc.body)
        const { id: docId } = ingestDocument.get(
            doc.title,
            doc.body,
            doc.kind,
            doc.meta != null ? JSON.stringify(doc.meta) : null,
            rawTokens.length,
            doc.id
        )
        const indices = indexer.buildIndex(rawTokens, docId)
        for (const { token, positions } of indices) {
            const { id: termId } = upsertTerm.get(token)
            ingestPosting.run(termId, docId, positions.length, JSON.stringify(positions))
        }
    }
})

async function ingest(corpus, batchSize = 500) {
    let batch = []
    for await (const doc of corpus.documents()) {
        batch.push(doc)
        if (batch.length >= batchSize) {
            ingestBatch(batch)
            batch = []
        }
    }
    if (batch.length > 0) {
        ingestBatch(batch)
    }
}

createSchema()

await ingest(filesCorpus)