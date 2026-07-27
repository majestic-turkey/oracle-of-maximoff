/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { MinHeap } from '../src/tools/minHeap.ts'

const numHeap = (capacity?: number) => new MinHeap<number>((a, b) => a - b, capacity)

describe('MinHeap — empty heap', () => {
  test('peek() returns null', () => {
    assert.equal(numHeap().peek(), null)
  })

  test('extractMin() returns undefined', () => {
    assert.equal(numHeap().extractMin(), undefined)
  })

  test('drain() returns an empty array', () => {
    assert.deepEqual(numHeap().drain(), [])
  })
})

describe('MinHeap — single item', () => {
  test('peek() and extractMin() both return it', () => {
    const heap = numHeap()
    heap.insert(5)
    assert.equal(heap.peek(), 5)
    assert.equal(heap.extractMin(), 5)
    assert.equal(heap.peek(), null)
  })
})

describe('MinHeap — ordering', () => {
  test('extractMin() always returns the current smallest, regardless of insertion order', () => {
    const heap = numHeap()
    for (const n of [5, 3, 8, 1, 9, 2, 7]) heap.insert(n)

    const drained: number[] = []
    let min
    while ((min = heap.extractMin()) !== undefined) drained.push(min)

    assert.deepEqual(drained, [1, 2, 3, 5, 7, 8, 9])
  })

  test('drain() returns items in ascending order and empties the heap', () => {
    const heap = numHeap()
    for (const n of [4, 2, 6, 1]) heap.insert(n)

    assert.deepEqual(heap.drain(), [1, 2, 4, 6])
    assert.equal(heap.peek(), null)
  })

  test('peek() always reflects the current minimum after inserts', () => {
    const heap = numHeap()
    heap.insert(10)
    assert.equal(heap.peek(), 10)
    heap.insert(4)
    assert.equal(heap.peek(), 4)
    heap.insert(7)
    assert.equal(heap.peek(), 4)
    heap.insert(1)
    assert.equal(heap.peek(), 1)
  })

  test('handles duplicate values', () => {
    const heap = numHeap()
    for (const n of [3, 3, 1, 1, 2]) heap.insert(n)
    assert.deepEqual(heap.drain(), [1, 1, 2, 3, 3])
  })
})

describe('MinHeap — capacity (bounded top-k behavior)', () => {
  test('inserting fewer items than capacity keeps them all', () => {
    const heap = numHeap(5)
    for (const n of [3, 1, 2]) heap.insert(n)
    assert.deepEqual(heap.drain(), [1, 2, 3])
  })

  test('exceeding capacity evicts the smallest, keeping the largest k', () => {
    const heap = numHeap(3)
    for (const n of [5, 1, 9, 2, 8, 3, 7]) heap.insert(n)
    // Should retain the 3 largest values inserted: 9, 8, 7
    assert.deepEqual(heap.drain(), [7, 8, 9])
  })

  test('heap size never exceeds capacity', () => {
    const heap = numHeap(2)
    for (const n of [1, 2, 3, 4, 5]) {
      heap.insert(n)
      assert.ok(heap.getHeap().length <= 2)
    }
  })

  test('capacity of 1 keeps only the single largest item', () => {
    const heap = numHeap(1)
    for (const n of [4, 9, 2, 9, 1]) heap.insert(n)
    assert.deepEqual(heap.drain(), [9])
  })
})

describe('MinHeap — custom comparator (object entries)', () => {
  interface Entry {
    docId: number
    score: number
  }

  test('orders and evicts by the comparator, not by object identity or insertion order', () => {
    const heap = new MinHeap<Entry>((a, b) => a.score - b.score, 3)
    const entries: Entry[] = [
      { docId: 1, score: 5 },
      { docId: 2, score: 9 },
      { docId: 3, score: 1 },
      { docId: 4, score: 7 },
      { docId: 5, score: 3 },
    ]
    for (const e of entries) heap.insert(e)

    // Top 3 by score: docId 2 (9), 4 (7), 1 (5)
    assert.deepEqual(
      heap.drain().map(e => e.docId),
      [1, 4, 2],
    )
  })
})
