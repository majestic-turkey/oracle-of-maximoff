import analyze from './nlp.ts'
import { MinHeap } from './minHeap.ts'
import { buildSnippet } from './snippet.ts'
import type { ScoredDoc } from '../types.ts'

export interface SearchResult extends ScoredDoc {
    title?: string
    snippet: string
}

export interface SearchOptions {
    k1?: number
    b?: number
    topK?: number
}


interface PostingRow {
    id: number
    frequency: number
    doc_id: number
    token_count: number
    positions: string | null // JSON array of word indices, as stored by ingest
}

interface DocTextRow {
    id: number
    title: string
    body: string
}

// Minimal shape of what we need from a better-sqlite3 Database, avoiding pulling extra DB type defs
interface QueryableDb {
    prepare(sql: string): {
        all(...params: unknown[]): unknown[]
        get(...params: unknown[]): unknown
    }
}

// Ranks documents against a query using BM25, returning the top 'topK' by score (descending)
export function search(db: QueryableDb, query: string, options: SearchOptions = {}): SearchResult[] {
    const { k1 = 1.2, b = 0.75, topK = 25 } = options

    const tokenizedQuery = analyze(query)

    const queryStatement = db.prepare(`
        select t.id, p.frequency, p.doc_id, d.token_count, p.positions from terms t
        join postings p on t.id = p.term_id
        join documents d on p.doc_id = d.id
        where t.term = ?
        `)

    const docCount = (db.prepare('select count(*) as count from documents').get() as { count: number }).count
    const avgDocLength = (db.prepare('select avg(token_count) as avgdl from documents').get() as { avgdl: number | null }).avgdl

    const queryScores = new Map<number, number>()
    // Every position at which any query term hit a document, unioned across terms so the
    // snippet can favour a window covering several of them. A Set because two query words
    // can stem to the same term, which would otherwise double-count the same position.
    const matchedPositions = new Map<number, Set<number>>()

    for (const { token } of tokenizedQuery) {
        const rows = queryStatement.all(token) as PostingRow[]
        const df = rows.length
        if (df === 0) continue
        const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5))

        for (const row of rows) {
            const docLength = row.token_count
            const tf = row.frequency
            const termScore = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength!))))
            queryScores.set(row.doc_id, (queryScores.get(row.doc_id) || 0) + termScore)

            if (!matchedPositions.has(row.doc_id)) {
                matchedPositions.set(row.doc_id, new Set())
            }
            const positions = matchedPositions.get(row.doc_id)!
            for (const position of JSON.parse(row.positions ?? '[]') as number[]) {
                positions.add(position)
            }
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

    // One trip for both the title and the body the snippet is cut from; the bodies of a
    // single page of results are cheap next to the postings scan above.
    const ids = results.map(({ docId }) => docId)
    const idPlaceholders = ids.map(() => '?').join(', ')
    const documentRows = db.prepare(`select id, title, body from documents where id in (${idPlaceholders})`).all(...ids) as DocTextRow[]
    const docsById = new Map(documentRows.map((doc) => [doc.id, doc]))

    return results.map((result) => {
        const doc = docsById.get(result.docId)
        const positions = [...(matchedPositions.get(result.docId) ?? [])].sort((a, c) => a - c)
        return {
            ...result,
            title: doc?.title,
            snippet: buildSnippet(doc?.body ?? '', positions),
        }
    })
}
