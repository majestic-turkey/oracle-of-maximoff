import Indexer from './tools/indexer.ts'
import { ulysses, ofMiceAndMen, braveNewWorld } from './text.ts'

export { Indexer, ulysses, ofMiceAndMen, braveNewWorld }
export type { Corpus, Doc, Token } from './types.ts'

const [text1, text2, text3] = [ulysses, ofMiceAndMen, braveNewWorld]
const indexer = new Indexer()


setTimeout(() => console.log(indexer.buildIndex(indexer.analyze(text1), 1)), 2000)
setTimeout(() => console.log(indexer.buildIndex(indexer.analyze(text2), 2)), 4000)
setTimeout(() => console.log(indexer.buildIndex(indexer.analyze(text3), 3)), 6000)