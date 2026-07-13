/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Indexer from '../src/tools/indexer.ts'

// Deep-equal with a readable got/expected message.
const eq = (actual: unknown, expected: unknown) =>
  assert.deepEqual(actual, expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)

// Call a method that may not exist yet, so unbuilt API surfaces as a clear
// individual failure ("... is not implemented yet") instead of a TS error.
const call = <T = unknown>(idx: Indexer, method: string, ...args: unknown[]): T => {
  const fn = (idx as unknown as Record<string, unknown>)[method]
  if (typeof fn !== 'function') throw new Error(`Indexer.${method}() is not implemented yet`)
  return (fn as (...a: unknown[]) => T).apply(idx, args)
}

// Build an index and feed it documents as [text, docId] pairs.
const indexed = (...docs: [string, number][]): Indexer => {
  const idx = new Indexer()
  for (const [text, docId] of docs) idx.indexDocument(text, docId)
  return idx
}


describe('Indexer — analyze() passthrough', () => {
  test('delegates to the nlp pipeline: lowercases, drops stopwords, keeps positions', () => {
    eq(new Indexer(1).analyze('The cat sat'), [
      { token: 'cat', position: 1 },
      { token: 'sat', position: 2 },
    ])
  })
})

describe('Indexer — buildIndex()', () => {
  test('groups repeated tokens and collects their positions', () => {
    eq(
      new Indexer(1).buildIndex([
        { token: 'cat', position: 0 },
        { token: 'cat', position: 1 },
      ]),
      [{ token: 'cat', positions: [0, 1], docId: 1 }],
    )
  })

  test('sorts terms alphabetically', () => {
    eq(
      new Indexer(7).buildIndex([
        { token: 'dog', position: 2 },
        { token: 'cat', position: 0 },
        { token: 'cat', position: 1 },
      ]),
      [
        { token: 'cat', positions: [0, 1], docId: 7 },
        { token: 'dog', positions: [2], docId: 7 },
      ],
    )
  })
})

describe('Indexer — docId resolution', () => {
  test('uses the constructor docId', () => {
    eq(new Indexer(1).indexDocument('cat'), [{ token: 'cat', positions: [0], docId: 1 }])
  })

  test('falls back to the argument docId when none set on the instance', () => {
    eq(new Indexer().indexDocument('cat', 5), [{ token: 'cat', positions: [0], docId: 5 }])
  })

  test('constructor docId takes precedence over the argument', () => {
    eq(new Indexer(1).indexDocument('cat', 9), [{ token: 'cat', positions: [0], docId: 1 }])
  })

  test('throws when no docId is available', () => {
    assert.throws(() => new Indexer().indexDocument('cat'), /docId must be provided/)
    assert.throws(() => new Indexer().buildIndex([{ token: 'cat', position: 0 }]), /docId must be provided/)
  })
})

describe('Indexer — indexDocument() end-to-end', () => {
  test('excludes stopwords and preserves original token positions', () => {
    // "the" (positions 0 and 2) is a stopword and is dropped from the index.
    eq(new Indexer(1).indexDocument('the cat the cat'), [
      { token: 'cat', positions: [1, 3], docId: 1 },
    ])
  })
})


describe('Indexer — global postings', () => {
  test('getPostings() merges a term across documents, sorted by docId', () => {
    const idx = indexed(['the cat sat', 1], ['cat cat dog', 2])
    eq(call(idx, 'getPostings', 'cat'), [
      { docId: 1, positions: [1], tf: 1 },
      { docId: 2, positions: [0, 1], tf: 2 },
    ])
  })

  test('getPostings() reports tf as the number of positions in that document', () => {
    const idx = indexed(['cat cat dog', 2])
    eq(call(idx, 'getPostings', 'cat'), [{ docId: 2, positions: [0, 1], tf: 2 }])
  })

  test('getPostings() returns [] for a term not in the index', () => {
    const idx = indexed(['cat sat', 1])
    eq(call(idx, 'getPostings', 'zebra'), [])
  })

  test('a term appearing in one document has a single posting', () => {
    const idx = indexed(['the cat sat', 1], ['cat cat dog', 2])
    eq(call(idx, 'getPostings', 'dog'), [{ docId: 2, positions: [2], tf: 1 }])
  })
})

describe('Indexer — stats', () => {
  // Document length is measured in INDEXED terms (post-pipeline, stopwords
  // already removed): "the cat sat" -> [cat, sat] = 2; "cat cat dog" = 3.
  const idx = () => indexed(['the cat sat', 1], ['cat cat dog', 2])

  test('stats().docCount counts indexed documents', () => {
    eq(call<{ docCount: number }>(idx(), 'stats').docCount, 2)
  })

  test('stats().termCount counts unique terms across the corpus', () => {
    // {cat, sat, dog} = 3
    eq(call<{ termCount: number }>(idx(), 'stats').termCount, 3)
  })

  test('stats().avgDocLength is the mean indexed-token count per document', () => {
    // (2 + 3) / 2 = 2.5
    eq(call<{ avgDocLength: number }>(idx(), 'stats').avgDocLength, 2.5)
  })

  test('docFrequency() counts documents containing a term (for IDF)', () => {
    const i = idx()
    eq(call(i, 'docFrequency', 'cat'), 2)
    eq(call(i, 'docFrequency', 'dog'), 1)
    eq(call(i, 'docFrequency', 'missing'), 0)
  })
})

describe('Indexer — ingest & persistence (TODO)', () => {
  test('ingest(corpus) indexes every Doc from an AsyncIterable', { todo: true })
  test('persists the index to SQLite (documents/terms/postings)', { todo: true })
  test('ingests in batched transactions for speed', { todo: true })
  test('stores per-document length for BM25 length normalization', { todo: true })
})
