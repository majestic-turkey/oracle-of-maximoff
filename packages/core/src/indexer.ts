import analyze from './nlp.ts'
import type { Token } from './types.ts'

// Deduplicate tokens and sort them alphabetically, while also collecting their positions in the text
function groupAndSortTokens(tokens: TokenWithPosition[]): { token: string; positions: number[] }[] {
    const index: { [token: string]: number[] } = {}
    for (const { token, position } of tokens) {
        if (!index[token]) {
            index[token] = []
        }
        index[token].push(position)
    }
    return Object.entries(index).map(([token, positions]) => ({ token, positions })).sort((a, b) => a.token.localeCompare(b.token))
}

// Indexer class is responsible for inverse indexing of documents. It takes a document in the form of a string and creates an index that maps each unique word to the docID and positions that contain that word.

export default class Indexer {
    private docId?: number
    constructor(docId?: number) {
        this.docId = docId
    }
    
    // Reduce the text to tokens and their positions in the text
    analyze(text: string): TokenWithPosition[] {
        return analyze(text)
    }
    
    // Build an index from the tokens, mapping each unique token to its positions in the text and assigning this.docId
    buildIndex(tokens: TokenWithPosition[], docId?: number): Token[] {
        const docIdToUse = this.docId ?? docId
        if (docIdToUse === undefined) {
            throw new Error('docId must be provided either in the constructor or as an argument to buildIndex')
        }
        const sortedTokens = groupAndSortTokens(tokens)
        return sortedTokens.map(({ token, positions }) => ({ token, positions, docId: docIdToUse }))
    }
    
    // Index function to analyze the text and build the index in one step
    indexDocument(text: string, docId?: number): Token[] {
        const tokens = this.analyze(text)
        return this.buildIndex(tokens, docId)
    }
}

type TokenWithPosition = { token: string; position: number }