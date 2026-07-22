import { parseArgs } from 'node:util'

const { positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
        k1: { type: 'string', default: '1.2', short: 'k' },
        b: { type: 'string', default: '0.75', short: 'b' },
    },
})

const query = positionals.join(' ')

console.log(`Query: ${query}`)