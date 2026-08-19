export interface Corpus {
  id: string // "simplewiki", "tmdb"
  documents(): AsyncIterable<Doc>
}

export interface Doc {
  id: string // "simplewiki:12345", "tmdb:person:3223"
  title: string
  body: string // what gets tokenized and indexed
  kind: string // "article" | "movie" | "person"
  meta?: Record<string, unknown> // tmdb_id, popularity, url, ...
}

export interface Token {
  token: string
  positions: number[]
  docId: number
}

export interface DocRow {
    id: number
    title: string
}

export interface ScoredDoc {
    docId: number
    score: number
}