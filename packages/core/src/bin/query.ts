import { parseArgs } from 'node:util'
import analyze from '../tools/nlp.ts'
import db from '../db/db.js'

const { positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
        k1: { type: 'string', default: '1.2', short: 'k' },
        b: { type: 'string', default: '0.75', short: 'b' },
    },
})

const query = positionals.join(' ')

const tokenizedQuery = analyze(query)

const queryStatement = db.prepare(`
    select t.id, p.frequency, p.doc_id from terms t
    left join postings p on t.id = p.term_id
    where t.term = ?
    `)

for (const { token } of tokenizedQuery) {
    const rows = queryStatement.all(token)
    console.log(`Results for token "${token}":`, rows)
}