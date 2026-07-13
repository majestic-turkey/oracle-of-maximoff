/**
 * Indexer class is responsible for inverse indexing of documents. It takes a document in the form of a string and creates an
 * index that maps each unique word to the docID and positions that contain that word.
 */

import analyze from './nlp.js'
import type { Token } from './types.js'

// Sort the tokens, removing any duplicates, adding the docID and positions to the index
function sortTokens(tokens: { token: string; position: number }[]): { token: string; positions: number[] }[] {
    const index: { [token: string]: number[] } = {}
    for (const { token, position } of tokens) {
        if (!index[token]) {
            index[token] = []
        }
        index[token].push(position)
    }
    return Object.entries(index).map(([token, positions]) => ({ token, positions }))
}

// Indexer class is responsible for inverse indexing of documents. It takes a document in the form of a string and creates an index that maps each unique word to the docID and positions that contain that word.

export default class Indexer {
    private docId: number
    constructor(docId: number = 0) {
        this.docId = docId
    }

    // Reduce the text to tokens and their positions in the text
    analyze(text: string): { token: string; position: number }[] {
        return analyze(text)
    }

    // Build an index from the tokens, mapping each unique token to its positions in the text and assigning this.docId
    buildIndex(tokens: { token: string; position: number }[]): Token[] {
        const sortedTokens = sortTokens(tokens)
        return sortedTokens.map(({ token, positions }) => ({ token, positions, docId: this.docId }))
    }

}