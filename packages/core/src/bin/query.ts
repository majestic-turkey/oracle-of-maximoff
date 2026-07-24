import { parseArgs } from 'node:util'
import analyze from '../tools/nlp.ts'
import db from '../db/db.js'
import { MinHeap } from './minHeap.ts'

interface DocRow {
    id: number
    title: string
}

const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
        k1: { type: 'string', default: '1.2', short: 'k' },
        b: { type: 'string', default: '0.75', short: 'b' },
    },
})

const k1 = parseFloat(values.k1)
const b = parseFloat(values.b)

const query = positionals.join(' ')

const tokenizedQuery = analyze(query)

const queryStatement = db.prepare(`
    select t.id, p.frequency, p.doc_id, d.token_count from terms t
    join postings p on t.id = p.term_id
    join documents d on p.doc_id = d.id
    where t.term = ?
    `)

const queryScores = new Map<number, number>()

const docCount = db.prepare('select count(*) as count from documents').get().count
const avgDocLength = db.prepare('select avg(token_count) as avgdl from documents').get().avgdl
const scoreHeap = new MinHeap<{ docId: number; score: number }>((a, b) => a.score - b.score) // Sort by score in ascending order

for (const { token } of tokenizedQuery) {
    const rows = queryStatement.all(token)
    const df = rows.length
    const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5))
    
    for (const row of rows) {
        const docLength = row.token_count
        const tf = row.frequency
        const termScore = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength))))
        queryScores.set(row.doc_id, (queryScores.get(row.doc_id) || 0) + termScore)
    }
}
queryScores.forEach((score, docId) => {
    if (scoreHeap.getHeap().length < 25 || score > scoreHeap.peek()!.score) {
        scoreHeap.insert({ docId, score })
    }
})
const sortedScores = scoreHeap.drain().reverse() // Sort in descending order

const ids = sortedScores.map(({ docId }) => docId)
const idPlaceholders = ids.map(() => '?').join(', ')
const documentTitles = db.prepare(`select * from documents where id in (${idPlaceholders})`).all(...ids)
const titlesById = new Map(documentTitles.map((doc: DocRow) => [doc.id, doc.title]))

console.log('Top 25 results:')
const results = sortedScores.map(({ docId, score }) => ({
    id: docId,
    title: titlesById.get(docId),
    score,
}))
console.table(results)
