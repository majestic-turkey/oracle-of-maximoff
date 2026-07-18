import Parser from 'wikiparser-node'
import { convert } from 'html-to-text'
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Doc } from '../types.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const rlInterface = readline.createInterface({
    input: fs.createReadStream(path.join(__dirname, '../../../../data/corpus/simplewiki_markup.jsonl'), { encoding: 'utf-8' }),
    crlfDelay: Infinity,
})

// Parse each body field, creating an AST representation of the markup
for await (const line of rlInterface) {
    const doc: Doc = JSON.parse(line)
    const body = doc.body

    // Parse the AST into raw text
    const options = {
        selectors: [
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' },
            { selector: 'figure', format: 'skip' },
        ],
    }
    const rawText = convert(Parser.toHtml(body), options)
    doc.body = rawText

    // Write the updated document back to the file
    const docString = JSON.stringify(doc)
    fs.appendFileSync(
        path.join(__dirname, '../../../../data/corpus/simplewiki_parsed.jsonl'),
        docString + '\n',
        { encoding: 'utf-8' }
    )
}