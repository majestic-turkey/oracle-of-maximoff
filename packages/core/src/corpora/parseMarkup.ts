import Parser from 'wikiparser-node'
import { convert } from 'html-to-text'
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Doc } from '../types.ts'

const characterTemplates = new Map([
    ['Template:Okina', 'ʻ'],
    ['Template:Ndash', '–'],
    ['Template:Mdash', '—'],
    ['Template:Nbsp', ' '],
])
for (const [title, replacement] of characterTemplates) {
    Parser.templates.set(title, replacement)
}

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


export function parseDoc(doc: Doc): Doc {
    try {
        return { ...doc, body: wikitextToPlainText(doc.body) }
    } catch (err) {
        console.warn(`Failed to parse markup for ${doc.id} "${doc.title}": ${(err as Error).message}`)
        return doc
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))

    const rlInterface = readline.createInterface({
        input: fs.createReadStream(path.join(__dirname, '../../../../data/corpus/simplewiki_markup.jsonl'), { encoding: 'utf-8' }),
        crlfDelay: Infinity,
    })

    for await (const line of rlInterface) {
        const doc: Doc = JSON.parse(line)
        console.log(`Parsing doc: ${doc.title}`)
        const parsed = parseDoc(doc)

        fs.appendFileSync(
            path.join(__dirname, '../../../../data/corpus/simplewiki_parsed.jsonl'),
            JSON.stringify(parsed) + '\n',
            { encoding: 'utf-8' }
        )
    }
}
