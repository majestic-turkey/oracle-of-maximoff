import Indexer from './tools/indexer.ts'

export type { Corpus, Doc, Token } from './types.ts'

const indexer = new Indexer()


console.log(indexer.stats())