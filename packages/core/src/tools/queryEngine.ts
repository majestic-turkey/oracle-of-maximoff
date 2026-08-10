import analyze from './nlp.ts'
import { MinHeap } from './minHeap.ts'
import type { ScoredDoc, DocRow } from '../types.ts'

export interface SearchResult extends ScoredDoc {
    title?: string
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
        select t.id, p.frequency, p.doc_id, d.token_count from terms t
        join postings p on t.id = p.term_id
        join documents d on p.doc_id = d.id
        where t.term = ?
        `)

    const docCount = (db.prepare('select count(*) as count from documents').get() as { count: number }).count
    const avgDocLength = (db.prepare('select avg(token_count) as avgdl from documents').get() as { avgdl: number | null }).avgdl

    const queryScores = new Map<number, number>()

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
        }
    }

    const scoreHeap = new MinHeap<SearchResult>((a, c) => a.score - c.score, topK)
    queryScores.forEach((score, docId) => {
        if (scoreHeap.getHeap().length < topK || score > scoreHeap.peek()!.score) {
            scoreHeap.insert({ docId, score })
        }
    })

    const ids = scoreHeap.getHeap().map(({ docId }) => docId)
    const idPlaceholders = ids.map(() => '?').join(', ')
    const documentTitles = db.prepare(`select id, title from documents where id in (${idPlaceholders})`).all(...ids) as DocRow[]
    const titlesById = new Map(documentTitles.map((doc) => [doc.id, doc.title]))

    const results = scoreHeap.drain().reverse()
    return results.map((result) => ({
        ...result,
        title: titlesById.get(result.docId),
    }))
}
