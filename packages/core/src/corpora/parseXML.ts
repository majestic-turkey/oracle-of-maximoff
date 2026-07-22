import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sax from 'sax'
import type { Readable } from 'node:stream'
import type { Doc } from '../types.ts'

export function extractDocs(input: Readable, onDoc: (doc: Doc) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const saxStream = sax.createStream(true, { trim: true })

        // Buffers
        const tagStack: string[] = [] // Stack to keep track of the current tag path
        let currentDoc: Partial<Doc> | null = null
        let currentText = ''

        saxStream.on('error', reject)

        saxStream.on('opentag', (node) => {
            // Push the tag name onto the stack and reset the current text buffer
            tagStack.push(node.name)
            currentText = ''

            if (node.name === 'page') {
                currentDoc = { kind: 'article', meta: {} }
            }

            if (node.name === 'redirect') {
                currentDoc = null
            }
        })

        saxStream.on('text', (text) => {
            currentText += text
        })

        saxStream.on('closetag', (nodeName) => {
            const tagPath = tagStack.join('/') // Get the current tag path as a string (e.g., "mediawiki/page/title")

            if (currentDoc) {
                if (tagPath === 'mediawiki/page/title') {
                    currentDoc.title = currentText
                } else if (tagPath === 'mediawiki/page/id') {
                    currentDoc.id = `simplewiki:${currentText}`
                } else if (tagPath === 'mediawiki/page/revision/text') {
                    currentDoc.body = currentText
                } else if (tagPath === 'mediawiki/page/ns') {
                    if (currentText !== '0') {
                        currentDoc = null
                    }
                }
            }

            if (nodeName === 'page' && currentDoc) {
                onDoc(currentDoc as Doc)
                currentDoc = null
            }

            tagStack.pop()
        })

        saxStream.on('end', () => resolve())

        input.pipe(saxStream)
    })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const outPath = path.join(__dirname, '../../../../data/corpus/simplewiki_markup.jsonl')

    await extractDocs(
        fs.createReadStream(path.join(__dirname, '../../../../data/corpus/simplewiki.xml'), { encoding: 'utf-8' }),
        (doc) => {
            fs.appendFileSync(outPath, JSON.stringify(doc) + '\n', { encoding: 'utf-8' })
        }
    )
}
