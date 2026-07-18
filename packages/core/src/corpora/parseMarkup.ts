import Parser from 'wikiparser-node'
import { convert } from 'html-to-text'
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Doc } from '../types.ts'

const htmlToTextOptions = {
    selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'figure', format: 'skip' },
    ],
}

export function wikitextToPlainText(wikitext: string): string {
    return convert(Parser.toHtml(wikitext), htmlToTextOptions)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))

    const rlInterface = readline.createInterface({
        input: fs.createReadStream(path.join(__dirname, '../../../../data/corpus/simplewiki_markup.jsonl'), { encoding: 'utf-8' }),
        crlfDelay: Infinity,
    })

    for await (const line of rlInterface) {
        const doc: Doc = JSON.parse(line)
        doc.body = wikitextToPlainText(doc.body)

        fs.appendFileSync(
            path.join(__dirname, '../../../../data/corpus/simplewiki_parsed.jsonl'),
            JSON.stringify(doc) + '\n',
            { encoding: 'utf-8' }
        )
    }
}
