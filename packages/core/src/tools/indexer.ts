import { Stemmer, analyze } from './nlp.ts'
import type { Token } from '../types.ts'

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
    private stemmer: Stemmer
    private tokensWithDocAndPositions: Map<string, Map<number, number[]>>
    private docIdAndLength: Map<number, number>

    constructor(docId?: number) {
        this.docId = docId
        this.stemmer = new Stemmer()
        this.tokensWithDocAndPositions = new Map()
        this.docIdAndLength = new Map()
    }

    // Reduce the text to tokens and their positions in the text
    analyze(text: string): TokenWithPosition[] {
        return analyze(text, false).map(({ token, position }) => ({ token: this.stemmer.stem(token), position }))
    }
    
    // Build an index from the tokens, mapping each unique token to its positions in the text and assigning this.docId
    buildIndex(tokens: TokenWithPosition[], docId?: number): Token[] {
        const docIdToUse = this.docId ?? docId
        if (docIdToUse === undefined) {
            throw new Error('docId must be provided either in the constructor or as an argument to buildIndex')
        }
        const sortedTokens = groupAndSortTokens(tokens)
        this.docIdAndLength.set(docIdToUse, tokens.length)
        return sortedTokens.map(({ token, positions }) => {
            if (!this.tokensWithDocAndPositions.has(token)) {
                this.tokensWithDocAndPositions.set(token, new Map())
            }
            const docMap = this.tokensWithDocAndPositions.get(token)!
            docMap.set(docIdToUse, positions)
            return { token, positions, docId: docIdToUse }
        })
    }
    
    // Index function to analyze the text and build the index in one step
    indexDocument(text: string, docId?: number): Token[] {
        const tokens = this.analyze(text)
        return this.buildIndex(tokens, docId)
    }

    // Get postings for a specific token, returning a map of docId to positions
    getPostings(token: string): { docId: number; positions: number[]; tf: number }[] {
        const postings: { docId: number; positions: number[]; tf: number }[] = []
        const docMap = this.tokensWithDocAndPositions.get(token)
        if (docMap) {
            for (const [docId, positions] of docMap.entries()) {
                postings.push({ docId, positions, tf: positions.length })
            }
        }
        return postings
    }

    // Get number of documents containing a specific token
    docFrequency(token: string): number {
        const docMap = this.tokensWithDocAndPositions.get(token)
        return docMap ? docMap.size : 0
    }

    // Just some stats
    stats(): { docCount: number; termCount: number; avgDocLength: number } {
        const totalDocs = this.docIdAndLength.size
        const totalTokens = this.tokensWithDocAndPositions.size
        const totalLength = Array.from(this.docIdAndLength.values()).reduce((sum, len) => sum + len, 0)
        const meanTokensPerDoc = totalDocs > 0 ? totalLength / totalDocs : 0
        return { docCount: totalDocs, termCount: totalTokens, avgDocLength: meanTokensPerDoc }
    }
}

type TokenWithPosition = { token: string; position: number }