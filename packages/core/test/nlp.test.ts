import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Stemmer } from '../src/nlp.ts'

// The step methods are `private` in TypeScript, but that is a compile-time
// fiction — the JS methods exist on the instance. Reach them at runtime so each
// step can be exercised in isolation. Calling a not-yet-implemented step
// (step3/4/5) throws, which is the intended "red" for an unbuilt step.
const stemmer = new Stemmer()
type StepFn = (w: string) => string
// Resolve the method *lazily*, inside the returned closure, so a step that
// hasn't been written yet fails as an individual, clearly-labeled test rather
// than throwing at collection time and collapsing the whole block.
const priv = (name: string): StepFn => (w: string) => {
  const fn = (stemmer as unknown as Record<string, unknown>)[name]
  if (typeof fn !== 'function') {
    throw new Error(`Stemmer.${name}() is not implemented yet`)
  }
  return (fn as StepFn).call(stemmer, w)
}

// Expected values below come from the canonical Porter algorithm spec, not from
// the current implementation — so genuine bugs surface as failures rather than
// being encoded as "correct".
const cases = (fn: StepFn, pairs: [string, string][]) => {
  for (const [input, expected] of pairs) {
    test(`${input} -> ${expected}`, () => {
      const actual = fn(input)
      assert.equal(actual, expected, `${input}: got ${show(actual)}, expected ${show(expected)}`)
    })
  }
}

// Quote/JSON-encode so undefined, '', and whitespace differences are visible.
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
    // -at / -bl / -iz  =>  + e
    ['conflated', 'conflate'],
    ['troubled', 'trouble'],
    ['sized', 'size'],
    // *d and not (*L or *S or *Z) => single letter
    ['hopping', 'hop'],
    ['tanned', 'tan'],
    // double L/S/Z is kept
    ['falling', 'fall'],
    ['hissing', 'hiss'],
    ['fizzed', 'fizz'],
    // m=1 and *o  =>  + e
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

// ---- Not yet implemented: these blocks stay red until you build the step ----

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
    ['adoption', 'adopt'], // -ion only after s or t
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
      ['rate', 'rate'], // kept: m=1 and *o (cvc)
      ['cease', 'ceas'],
    ])
  })
  describe('5b (final double L)', () => {
    cases(priv('step5'), [
      ['controll', 'control'],
      ['roll', 'roll'], // kept: m is not > 1
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
    ['agreed', 'agre'], // step1b -> "agree", then step5a strips the final e (m=1, not *o)
    ['troubles', 'troubl'],
    ['controlling', 'control'],
  ])
})
