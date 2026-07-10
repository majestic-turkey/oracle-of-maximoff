export interface Corpus {
  id: string; // "simplewiki", "tmdb"
  documents(): AsyncIterable<Doc>;
}

export interface Doc {
  id: string; // "simplewiki:12345", "tmdb:person:3223"
  title: string;
  body: string; // what gets tokenized and indexed
  kind: string; // "article" | "movie" | "person"
  meta?: Record<string, unknown>; // tmdb_id, popularity, url, ...
}
