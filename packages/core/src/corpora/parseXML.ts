import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sax from 'sax'
import type { Doc } from '../types.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const saxStream = sax.createStream(true, { trim: true })

const tagStack: string[] = []
let currentDoc: Partial<Doc> | null = null
let currentText = ''

saxStream.on('error', (err) => {
    console.error('Error parsing XML:', err)
})

saxStream.on('opentag', (node) => {
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
    const tagPath = tagStack.join('/')

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
        const docString = JSON.stringify(currentDoc as Doc)
        fs.appendFileSync(
            path.join(__dirname, '../../../../data/corpus/simplewiki_markup.jsonl'),
            docString + '\n',
            { encoding: 'utf-8' }
        )
        currentDoc = null
    }

    tagStack.pop()
})

fs.createReadStream(path.join(__dirname, '../../../../data/corpus/simplewiki.xml'), { encoding: 'utf-8' })
    .pipe(saxStream)
