import { WORD_SPLIT_REGEX } from './nlp.ts'

// Splits raw document text into words using the same boundary rule the indexer used,
// preserving original casing/order so indices line up with stored token positions.
export function splitWords(text: string): string[] {
    return text.split(WORD_SPLIT_REGEX).filter(word => word.length > 0)
}

export interface SnippetOptions {
    radius?: number // words kept on each side of the match window, default 4
}

interface Window {
    start: number
    end: number // exclusive
    count: number
}

// Finds the fixed-size window (2*radius+1 words) that covers the most matched positions,
// sliding it centered on each candidate match rather than just taking the first one.
function bestWindow(positions: number[], totalWords: number, radius: number): Window {
    const span = radius * 2 + 1
    let best: Window = { start: 0, end: 0, count: -1 }

    for (const center of positions) {
        const start = Math.max(0, Math.min(center - radius, totalWords - span))
        const end = Math.min(totalWords, start + span)
        const count = positions.filter(p => p >= start && p < end).length
        if (count > best.count) {
            best = { start, end, count }
        }
    }

    return best
}

// Builds a "... word word MATCH word word ..." snippet around the densest cluster of
// matched term positions in a document's raw body text.
export function buildSnippet(body: string, matchedPositions: number[], options: SnippetOptions = {}): string {
    const { radius = 4 } = options
    if (matchedPositions.length === 0) return ''

    const words = splitWords(body)
    if (words.length === 0) return ''

    const matchSet = new Set(matchedPositions)
    const { start, end } = bestWindow(matchedPositions, words.length, radius)

    const highlighted = words
        .slice(start, end)
        .map((word, i) => (matchSet.has(start + i) ? `**${word}**` : word))
        .join(' ')

    const prefix = start > 0 ? '… ' : ''
    const suffix = end < words.length ? ' …' : ''
    return prefix + highlighted + suffix
}
