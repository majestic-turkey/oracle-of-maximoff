// tokenize / filterStopwords / stem / analyze

export default function analyze(text: string): {
    token: string
    position: number
}[] {
    const tokens = tokenize(text)
    return tokens
}

function tokenize(text: string): {
    token: string
    position: number
}[] {
    const words = text.split(/\s+/)
    const tokens = words.map((word, index) => ({ token: word, position: index }))
    return tokens
}