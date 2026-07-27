import { parseArgs } from 'node:util'
import db from '../db/db.js'
import { search } from '../tools/queryEngine.ts'

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

const sortedScores = search(db, query, { k1, b })

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
