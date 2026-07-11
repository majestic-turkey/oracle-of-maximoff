/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import analyze, { Stemmer, tokenize, filterStopwords } from '../src/nlp.ts'

const stemmer = new Stemmer()
type StepFn = (w: string) => string

const priv = (name: string): StepFn => (w: string) => {
  const fn = (stemmer as unknown as Record<string, unknown>)[name]
  if (typeof fn !== 'function') {
    throw new Error(`Stemmer.${name}() is not implemented yet`)
  }
  return (fn as StepFn).call(stemmer, w)
}

const cases = (fn: StepFn, pairs: [string, string][]) => {
  for (const [input, expected] of pairs) {
    test(`${input} -> ${expected}`, () => {
      const actual = fn(input)
      assert.equal(actual, expected, `${input}: got ${show(actual)}, expected ${show(expected)}`)
    })
  }
}

const show = (v: unknown): string => (v === undefined ? 'undefined' : JSON.stringify(v))

describe('stem() — short-circuit & lowercasing', () => {
  test('words shorter than 3 chars are returned lowercased, unchanged', () => {
    assert.equal(stemmer.stem('as'), 'as')
    assert.equal(stemmer.stem('BE'), 'be')
    assert.equal(stemmer.stem('a'), 'a')
    assert.equal(stemmer.stem(''), '')
  })
})

describe('helpers (foundational)', () => {
  const measure = priv('measure')
  const cvc = priv('cvc')

  describe('measure(m)', () => {
    for (const [word, m] of [
      ['tree', 0], ['by', 0], ['tr', 0], ['ee', 0], ['y', 0],
      ['trouble', 1], ['trees', 1], ['ivy', 1], ['oats', 1],
      ['troubles', 2], ['private', 2], ['oaten', 2], ['orrery', 2],
    ] as [string, number][]) {
      test(`m(${word}) = ${m}`, () => {
        const actual = (measure as unknown as (w: string) => number)(word)
        assert.equal(actual, m, `m(${word}): got ${actual}, expected ${m}`)
      })
    }
  })

  describe('cvc', () => {
    const isCvc = cvc as unknown as (w: string) => boolean
    const cvcCase = (word: string, expected: boolean) =>
      assert.equal(isCvc(word), expected, `cvc(${word}): got ${isCvc(word)}, expected ${expected}`)
    test('true for consonant-vowel-consonant endings', () => {
      cvcCase('hop', true)
      cvcCase('fil', true)
    })
    test('false when final consonant is w, x, or y', () => {
      cvcCase('bow', false)
      cvcCase('box', false)
      cvcCase('bay', false)
    })
    test('false when the pattern is not C-V-C', () => {
      cvcCase('fail', false)
    })
  })
})

describe('step1a', () => {
  cases(priv('step1a'), [
    ['caresses', 'caress'],
    ['ponies', 'poni'],
    ['ties', 'ti'],
    ['caress', 'caress'],
    ['cats', 'cat'],
  ])
})

describe('step1b', () => {
  cases(priv('step1b'), [
    ['feed', 'feed'],
    ['agreed', 'agree'],
    ['plastered', 'plaster'],
    ['bled', 'bled'],
    ['motoring', 'motor'],
    ['sing', 'sing'],
    ['conflated', 'conflate'],
    ['troubled', 'trouble'],
    ['sized', 'size'],
    ['hopping', 'hop'],
    ['tanned', 'tan'],
    ['falling', 'fall'],
    ['hissing', 'hiss'],
    ['fizzed', 'fizz'],
    ['filing', 'file'],
    ['failing', 'fail'],
  ])
})

describe('step1c', () => {
  cases(priv('step1c'), [
    ['happy', 'happi'],
    ['sky', 'sky'],
  ])
})

describe('step2', () => {
  cases(priv('step2'), [
    ['relational', 'relate'],
    ['conditional', 'condition'],
    ['valenci', 'valence'],
    ['hesitanci', 'hesitance'],
    ['digitizer', 'digitize'],
    ['conformabli', 'conformable'],
    ['radicalli', 'radical'],
    ['differentli', 'different'],
    ['vileli', 'vile'],
    ['analogousli', 'analogous'],
    ['vietnamization', 'vietnamize'],
    ['predication', 'predicate'],
    ['operator', 'operate'],
    ['feudalism', 'feudal'],
    ['decisiveness', 'decisive'],
    ['hopefulness', 'hopeful'],
    ['callousness', 'callous'],
    ['formaliti', 'formal'],
    ['sensitiviti', 'sensitive'],
    ['sensibiliti', 'sensible'],
  ])
})

describe('step3', () => {
  cases(priv('step3'), [
    ['triplicate', 'triplic'],
    ['formative', 'form'],
    ['formalize', 'formal'],
    ['electriciti', 'electric'],
    ['electrical', 'electric'],
    ['hopeful', 'hope'],
    ['goodness', 'good'],
  ])
})

describe('step4', () => {
  cases(priv('step4'), [
    ['revival', 'reviv'],
    ['allowance', 'allow'],
    ['inference', 'infer'],
    ['airliner', 'airlin'],
    ['gyroscopic', 'gyroscop'],
    ['adjustable', 'adjust'],
    ['defensible', 'defens'],
    ['irritant', 'irrit'],
    ['replacement', 'replac'],
    ['adjustment', 'adjust'],
    ['dependent', 'depend'],
    ['adoption', 'adopt'],
    ['homologou', 'homolog'],
    ['communism', 'commun'],
    ['activate', 'activ'],
    ['angulariti', 'angular'],
    ['homologous', 'homolog'],
    ['effective', 'effect'],
    ['bowdlerize', 'bowdler'],
  ])
})

describe('step5', () => {
  describe('5a (final -e)', () => {
    cases(priv('step5'), [
      ['probate', 'probat'],
      ['rate', 'rate'],
      ['cease', 'ceas'],
    ])
  })
  describe('5b (final double L)', () => {
    cases(priv('step5'), [
      ['controll', 'control'],
      ['roll', 'roll'],
    ])
  })
})

describe('stem() end-to-end', () => {
  cases((w: string) => stemmer.stem(w), [
    ['caresses', 'caress'],
    ['happy', 'happi'],
    ['relational', 'relat'],
    ['conditional', 'condit'],
    ['plastered', 'plaster'],
    ['motoring', 'motor'],
    ['sing', 'sing'],
    ['meetings', 'meet'],
    ['agreed', 'agre'],
    ['troubles', 'troubl'],
    ['controlling', 'control'],
  ])
})


type Tok = { token: string; position: number }

const expectTokens = (actual: Tok[], expected: [string, number][]) => {
  const want: Tok[] = expected.map(([token, position]) => ({ token, position }))
  assert.deepEqual(actual, want, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(want)}`)
}

describe('tokenize()', () => {
  describe('M1 behavior', () => {
    test('lowercases (case folding)', () => {
      expectTokens(tokenize('Hello WORLD'), [['hello', 0], ['world', 1]])
    })
    test('single word -> one token at position 0', () => {
      expectTokens(tokenize('cat'), [['cat', 0]])
    })
    test('assigns sequential positions', () => {
      expectTokens(tokenize('the quick brown fox'), [
        ['the', 0], ['quick', 1], ['brown', 2], ['fox', 3],
      ])
    })
    test('collapses internal whitespace runs', () => {
      expectTokens(tokenize('a  b\tc'), [['a', 0], ['b', 1], ['c', 2]])
    })
    test('keeps numerals as tokens', () => {
      expectTokens(tokenize('iron man 3'), [['iron', 0], ['man', 1], ['3', 2]])
    })
  })

  describe('Post-M1 behavior', () => {
    test('strips surrounding punctuation', () => {
      expectTokens(tokenize('hello,'), [['hello', 0]])
      expectTokens(tokenize('(hi)'), [['hi', 0]])
      expectTokens(tokenize('cat.'), [['cat', 0]])
    })
    test('empty string yields no tokens', () => {
      expectTokens(tokenize(''), [])
    })
    test('leading/trailing whitespace yields no empty tokens', () => {
      expectTokens(tokenize('  hi  '), [['hi', 0]])
    })
  })

  describe('RED — nasty inputs: split on non-alphanumeric', () => {
    test('splits hyphenated compounds', () => {
      expectTokens(tokenize('state-of-the-art'), [
        ['state', 0], ['of', 1], ['the', 2], ['art', 3],
      ])
      expectTokens(tokenize('co-operate'), [['co', 0], ['operate', 1]])
    })
    test('splits on apostrophes (contraction remnants become their own tokens)', () => {
      expectTokens(tokenize("don't"), [['don', 0], ['t', 1]])
      expectTokens(tokenize("O'Brien"), [['o', 0], ['brien', 1]])
    })
  })

  describe('TODO — decisions still open in plan.md', () => {
    test('symbols: "C#", "C++" (collapse to "c" vs special-case, TBD)', { todo: true })
    test('non-ASCII / Unicode folding: "café", "naïve" (TBD)', { todo: true })
  })
})

describe('filterStopwords()', () => {
  test('removes stopwords, preserving surviving tokens\' positions', () => {
    expectTokens(filterStopwords([{ token: 'the', position: 0 }, { token: 'cat', position: 1 }]), [
      ['cat', 1],
    ])
  })
  test('keeps content words unchanged', () => {
    expectTokens(filterStopwords([{ token: 'cat', position: 0 }, { token: 'run', position: 1 }]), [
      ['cat', 0], ['run', 1],
    ])
  })
  test('removal is case-insensitive', () => {
    expectTokens(filterStopwords([{ token: 'The', position: 0 }, { token: 'Cat', position: 1 }]), [
      ['Cat', 1],
    ])
  })
  test('preserves original positions (gaps) after filtering', () => {
    expectTokens(
      filterStopwords([
        { token: 'the', position: 0 },
        { token: 'quick', position: 1 },
        { token: 'and', position: 2 },
        { token: 'brown', position: 3 },
      ]),
      [['quick', 1], ['brown', 3]],
    )
  })
  test('all-stopwords input -> empty', () => {
    expectTokens(filterStopwords([{ token: 'the', position: 0 }, { token: 'a', position: 1 }]), [])
  })
  test('empty input -> empty', () => {
    expectTokens(filterStopwords([]), [])
  })
  test('stopword-list sanity: common words removed, content words kept', () => {
    const toks = ['the', 'a', 'is', 'cat', 'run'].map((token, position) => ({ token, position }))
    expectTokens(filterStopwords(toks), [['cat', 3], ['run', 4]])
  })
})

describe('analyze() — end-to-end pipeline', () => {
  describe('M1 behavior', () => {
    test('lowercases, drops stopwords, keeps original positions', () => {
      expectTokens(analyze('This test sentence is a test'), [
        ['test', 1], ['sentence', 2], ['test', 5],
      ])
    })
  })

  describe('Post-M1 behavior', () => {
    test('strips punctuation across the pipeline', () => {
      expectTokens(analyze('The cat sat.'), [['cat', 1], ['sat', 2]])
    })
    test('empty input yields no tokens', () => {
      expectTokens(analyze(''), [])
    })
  })

  describe('Design choices that may conflict later', () => {
    test('stems terms when stemming is enabled (reuses Stemmer)', { todo: true })
    test('query and document text produce identical token streams', { todo: true })
    test('emitted token key aligns with the Token interface (term vs token)', { todo: true })
  })
})
