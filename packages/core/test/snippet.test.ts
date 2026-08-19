/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { splitWords, buildSnippet } from '../src/tools/snippet.ts'

describe('splitWords', () => {
  test('splits on punctuation, hyphens, and contractions like the tokenizer does', () => {
    assert.deepEqual(splitWords("Well-known: don't split on spaces alone."), [
      'Well', 'known', 'don', 't', 'split', 'on', 'spaces', 'alone'
    ])
  })

  test('preserves original casing', () => {
    assert.deepEqual(splitWords('The Oracle of Maximoff'), ['The', 'Oracle', 'of', 'Maximoff'])
  })
})

describe('buildSnippet', () => {
  const body = 'one two three four five six seven eight nine ten eleven twelve'

  test('returns empty string when there are no matches', () => {
    assert.equal(buildSnippet(body, []), '')
  })

  test('returns empty string when the body has matched positions but no actual words', () => {
    // e.g. a body that's gone empty/punctuation-only since the postings were indexed
    assert.equal(buildSnippet('!!! ---', [0]), '')
  })

  test('centers a window on the match and highlights it', () => {
    // "five" is at position 4
    const snippet = buildSnippet(body, [4], { radius: 2 })
    assert.equal(snippet, '… three four **five** six seven …')
  })

  test('omits leading ellipsis when the window starts at the beginning', () => {
    const snippet = buildSnippet(body, [0], { radius: 2 })
    assert.equal(snippet, '**one** two three four five …')
  })

  test('picks the window covering the most matches when scattered', () => {
    // an isolated match at 0 vs. a cluster at 4,5,6 - the cluster should win
    const snippet = buildSnippet(body, [0, 4, 5, 6], { radius: 2 })
    assert.equal(snippet, '… three four **five** **six** **seven** …')
  })
})
