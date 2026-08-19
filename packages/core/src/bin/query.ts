import { parseArgs } from 'node:util'
import db from '../db/db.js'
import { search } from '../tools/queryEngine.ts'

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

console.log('Top 25 results:')
const results = sortedScores.map(({ docId, title, score, snippet }) => ({
    id: docId,
    title,
    score: parseFloat(score.toFixed(4)),
    snippet,
}))
console.table(results)