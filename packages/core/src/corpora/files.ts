import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Corpus, Doc } from '../types.ts'

const CORPUS_DIR = path.resolve(import.meta.dirname, '../../../../data/corpus')

const START_MARKER = /\*\*\* START OF THE PROJECT GUTENBERG EBOOK.*?\*\*\*/s
const END_MARKER = /\*\*\* END OF THE PROJECT GUTENBERG EBOOK.*?\*\*\*/s
const TITLE_LINE = /^Title:\s*(.+)$/m

function extractBody(text: string): string {
    const start = text.match(START_MARKER)
    const end = text.match(END_MARKER)
    if (!start || !end) {
        return text.trim()
    }
    return text.slice(start.index! + start[0].length, end.index!).trim()
}

function extractTitle(text: string, fallback: string): string {
    const match = text.match(TITLE_LINE)
    return match ? match[1].trim() : fallback
}

function titleFromFilename(filename: string): string {
    return filename.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export const filesCorpus: Corpus = {
    id: 'files',
    async *documents() {
        const entries = await readdir(CORPUS_DIR)
        for (const entry of entries) {
            if (!entry.endsWith('.txt')) {
                continue
            }
            const raw = await readFile(path.join(CORPUS_DIR, entry), 'utf-8')
            const id = entry.replace(/\.txt$/, '')
            const doc: Doc = {
                id,
                title: extractTitle(raw, titleFromFilename(id)),
                body: extractBody(raw),
                kind: 'book',
            }
            yield doc
        }
    },
}
