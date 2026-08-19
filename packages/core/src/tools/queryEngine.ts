import analyze from './nlp.ts'
import { MinHeap } from './minHeap.ts'
import { buildSnippet } from './snippet.ts'
import type { ScoredDoc } from '../types.ts'

export interface SearchResult extends ScoredDoc {
    title?: string
    // The corpus-assigned id ("simplewiki:1079341"). Unlike docId, which is a SQLite
    // rowid and is reassigned when the index is rebuilt, this is stable across ingests -
    // so it is what a client should link on or persist.
    externalId?: string
    snippet: string
}

export interface SearchOptions {
    k1?: number
    b?: number
    topK?: number
}


interface ScoringRow {
    doc_id: number
    frequency: number
    token_count: number
}

interface PositionsRow {
    doc_id: number
    positions: string | null // JSON array of word indices, as stored by ingest
}

interface DocTextRow {
    id: number
    title: string
    body: string
    external_id: string
}

interface IndexStatsRow {
    doc_count: number
    total_tokens: number
}

// Minimal shape of what we need from a better-sqlite3 Database, avoiding pulling extra DB type defs
interface QueryableDb {
    prepare(sql: string): {
        all(...params: unknown[]): unknown[]
        get(...params: unknown[]): unknown
    }
}

// The two corpus-wide numbers BM25 needs. Reads the counters the index_stats triggers
// maintain; falls back to aggregating `documents` directly for databases indexed before
// that table existed, which is correct but scans the whole table (bodies included).
function readCorpusStats(db: QueryableDb): { docCount: number; avgDocLength: number | null } {
    try {
        const row = db.prepare('select doc_count, total_tokens from index_stats where id = 1').get() as IndexStatsRow | undefined
        if (row && row.doc_count > 0) {
            return { docCount: row.doc_count, avgDocLength: row.total_tokens / row.doc_count }
        }
    } catch {
        // No index_stats table on this database - fall through to the direct aggregate.
    }

    const { count } = db.prepare('select count(*) as count from documents').get() as { count: number }
    const { avgdl } = db.prepare('select avg(token_count) as avgdl from documents').get() as { avgdl: number | null }
    return { docCount: count, avgDocLength: avgdl }
}

// True when the database carries the narrow doc_lengths projection. Reading sqlite_master
// is a lookup in the in-memory schema, not a table scan.
function hasDocLengths(db: QueryableDb): boolean {
    return db.prepare("select 1 from sqlite_master where type = 'table' and name = 'doc_lengths'").get() !== undefined
}

// Scoring needs only doc_id, term frequency and document length. `positions` is left out
// on purpose: it is needed for at most topK documents, but a common term matches tens of
// thousands, and carrying that column widens every row read in the scan.
function scoringSql(db: QueryableDb): string {
    return hasDocLengths(db)
        ? `select p.doc_id, p.frequency, l.token_count
           from postings p
           join doc_lengths l on p.doc_id = l.doc_id
           where p.term_id = ?`
        // Databases indexed before doc_lengths existed still work, at the cost of a rowid
        // lookup into the full-width documents row for every posting.
        : `select p.doc_id, p.frequency, d.token_count
           from postings p
           join documents d on p.doc_id = d.id
           where p.term_id = ?`
}

// Second pass, once the winners are known: the positions of every query term inside just
// those documents, unioned per document so the snippet can favour a window covering
// several of them. A Set because two query words can stem to the same term, which would
// otherwise double-count a position and skew which window looks densest.
function readMatchedPositions(db: QueryableDb, termIds: number[], docIds: number[]): Map<number, Set<number>> {
    const byDoc = new Map<number, Set<number>>()
    if (termIds.length === 0 || docIds.length === 0) return byDoc

    const termPlaceholders = termIds.map(() => '?').join(', ')
    const docPlaceholders = docIds.map(() => '?').join(', ')
    const rows = db.prepare(`
        select doc_id, positions from postings
        where term_id in (${termPlaceholders}) and doc_id in (${docPlaceholders})
    `).all(...termIds, ...docIds) as PositionsRow[]

    for (const row of rows) {
        if (!byDoc.has(row.doc_id)) byDoc.set(row.doc_id, new Set())
        const positions = byDoc.get(row.doc_id)!
        for (const position of JSON.parse(row.positions ?? '[]') as number[]) {
            positions.add(position)
        }
    }
    return byDoc
}

// Ranks documents against a query using BM25, returning the top 'topK' by score (descending)
export function search(db: QueryableDb, query: string, options: SearchOptions = {}): SearchResult[] {
    const { k1 = 1.2, b = 0.75, topK = 25 } = options

    const tokenizedQuery = analyze(query)

    // Resolving the term to its id first keeps `terms` out of the per-posting join; the
    // lookup is one hit on the term unique index.
    const termIdStatement = db.prepare('select id from terms where term = ?')
    const scoringStatement = db.prepare(scoringSql(db))

    const { docCount, avgDocLength } = readCorpusStats(db)

    const queryScores = new Map<number, number>()
    const matchedTermIds = new Set<number>()

    for (const { token } of tokenizedQuery) {
        const term = termIdStatement.get(token) as { id: number } | undefined
        if (term === undefined) continue

        const rows = scoringStatement.all(term.id) as ScoringRow[]
        const df = rows.length
        if (df === 0) continue
        matchedTermIds.add(term.id)

        const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5))
        for (const row of rows) {
            const docLength = row.token_count
            const tf = row.frequency
            const termScore = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength!))))
            queryScores.set(row.doc_id, (queryScores.get(row.doc_id) || 0) + termScore)
        }
    }

    const scoreHeap = new MinHeap<ScoredDoc>((a, c) => a.score - c.score, topK)
    queryScores.forEach((score, docId) => {
        if (scoreHeap.getHeap().length < topK || score > scoreHeap.peek()!.score) {
            scoreHeap.insert({ docId, score })
        }
    })

    const results = scoreHeap.drain().reverse()
    if (results.length === 0) return []

    const ids = results.map(({ docId }) => docId)
    const matchedPositions = readMatchedPositions(db, [...matchedTermIds], ids)

    // One trip for both the title and the body the snippet is cut from; the bodies of a
    // single page of results are cheap next to the postings scan above.
    const idPlaceholders = ids.map(() => '?').join(', ')
    const documentRows = db.prepare(`select id, title, body, external_id from documents where id in (${idPlaceholders})`).all(...ids) as DocTextRow[]
    const docsById = new Map(documentRows.map((doc) => [doc.id, doc]))

    return results.map((result) => {
        const doc = docsById.get(result.docId)
        const positions = [...(matchedPositions.get(result.docId) ?? [])].sort((a, c) => a - c)
        return {
            ...result,
            title: doc?.title,
            externalId: doc?.external_id,
            snippet: buildSnippet(doc?.body ?? '', positions),
        }
    })
}
