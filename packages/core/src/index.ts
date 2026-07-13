import Indexer from './indexer.js'
import { ulysses, ofMiceAndMen, braveNewWorld } from './text.js'

export { Indexer, ulysses, ofMiceAndMen, braveNewWorld }
export type { Corpus, Doc, Token } from './types.js'

const [text1, text2, text3] = [ulysses, ofMiceAndMen, braveNewWorld]
const indexer = new Indexer(1)


setTimeout(() => console.log(indexer.buildIndex(indexer.analyze(text1))), 2000)
setTimeout(() => console.log(indexer.buildIndex(indexer.analyze(text2))), 4000)
setTimeout(() => console.log(indexer.buildIndex(indexer.analyze(text3))), 6000)