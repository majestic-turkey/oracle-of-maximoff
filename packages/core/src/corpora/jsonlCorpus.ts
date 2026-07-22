import { readdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type { Corpus, Doc } from '../types.ts'

const CORPUS_DIR = path.resolve(import.meta.dirname, '../../../../data/corpus')

function extractBody(doc: Doc): string {
    return doc.body.trim()
}

function extractTitle(doc: Doc): string {
    return doc.title.trim()
}

export const jsonlCorpus: Corpus = {
    id: 'simplewiki',
    async *documents() {
        const files = await readdir(CORPUS_DIR)
        for (const file of files) {
            if (file.endsWith('_parsed.jsonl')) {
                const filePath = path.join(CORPUS_DIR, file)
                const rlInterface = readline.createInterface({
                    input: createReadStream(filePath, { encoding: 'utf-8' }),
                    crlfDelay: Infinity,
                })
                for await (const line of rlInterface) {
                    if (line.trim() === '') continue
                    const doc: Doc = JSON.parse(line)
                    yield {
                        id: doc.id,
                        title: extractTitle(doc),
                        body: extractBody(doc),
                        kind: doc.kind,
                        meta: doc.meta,
                    }
                }
            }
        }
    },
}