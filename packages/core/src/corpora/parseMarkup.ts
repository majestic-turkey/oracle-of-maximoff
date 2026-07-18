import Parser from 'wikiparser-node'
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import type { Doc } from '../types.ts'

const rlInterface = readline.createInterface({
    input: fs.createReadStream(path.join(__dirname, '../../../../data/corpus/simplewiki_markup.jsonl'), { encoding: 'utf-8' }),
    crlfDelay: Infinity,
})

// Parse each body field, creating an AST representation of the markup
for await (const line of rlInterface) {
    const doc: Doc = JSON.parse(line)
    const bodyAST = Parser.parse(doc.body)

    // Parse the AST into raw text
    const rawText = parseAST(bodyAST)
    doc.body = rawText

    // Write the updated document back to the file
    const docString = JSON.stringify(doc)
    fs.appendFileSync(
        path.join(__dirname, '../../../../data/corpus/simplewiki_parsed.jsonl'),
        docString + '\n',
        { encoding: 'utf-8' }
    )
}

function parseAST(ast: any): string {
    for (const node of ast) {
        if (node.type === 'text') {
            return node.data
        } else if (node.type === 'quote') {
            return node.text.data
        } else if (node.type === 'link') {
            return node.linktarget.text.data
        }
    }
    return ''
}