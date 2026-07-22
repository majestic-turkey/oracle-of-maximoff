/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { wikitextToPlainText, parseDoc } from '../src/corpora/parseMarkup.ts'
import type { Doc } from '../src/types.ts'

describe('wikitextToPlainText()', () => {
    test('strips bold markup, keeping the text', () => {
        const result = wikitextToPlainText("'''April''' is a month.")
        assert.ok(result.includes('April is a month.'))
        assert.ok(!result.includes("'''"))
    })

    test('resolves a plain link to its display text, dropping the URL', () => {
        const result = wikitextToPlainText('It is the fourth [[month]] of the year.')
        assert.ok(result.includes('It is the fourth month of the year.'))
        assert.ok(!result.includes('[['))
        assert.ok(!result.includes('/wiki/'))
    })

    test('resolves a piped link to its display text, not its target', () => {
        const result = wikitextToPlainText('See [[Julian calendar|Julian]] for details.')
        assert.ok(result.includes('Julian'))
        assert.ok(!result.includes('Julian calendar'))
        assert.ok(!result.includes('[['))
    })

    test('does not crash on an unresolvable template, and drops the {{}} syntax', () => {
        const result = wikitextToPlainText('{{monththisyear|4}} rest of the text')
        assert.ok(result.includes('rest of the text'))
        assert.ok(!result.includes('{{'))
    })

    test('drops embedded image markup without leaking raw file URLs', () => {
        const result = wikitextToPlainText('[[File:Example.jpg|thumb|A caption]] Some article text.')
        assert.ok(result.includes('Some article text.'))
        assert.ok(!result.includes('/wiki/'))
        assert.ok(!result.includes('File:Example.jpg'))
    })

    test('resolves known character templates instead of splicing "Template:Name" into the word', () => {
        assert.equal(wikitextToPlainText("Lāna{{okina}}i").trim(), 'Lānaʻi')
        assert.equal(wikitextToPlainText('Permian{{ndash}}Triassic').trim(), 'Permian–Triassic')
        assert.ok(!wikitextToPlainText('Lāna{{okina}}i').includes('Template:'))
    })

    test('a File embed whose link= points at an interwiki link crashes the underlying parser', () => {
        // Regression marker for a real wikiparser-node bug (link.getTitleAttr
        // is not a function) hit on the "Jichang Garden" article. parseDoc()
        // is what makes the batch pipeline resilient to this, not this function.
        assert.throws(() => wikitextToPlainText(
            '[[File:Jichang Royal Garden.jpg|link=[[:en:File:Jichang Royal Garden]].jpg|right|thumb|250x250px|Jichang Yuan]]'
        ))
    })
})

describe('parseDoc()', () => {
    test('parses the body when the underlying parser succeeds', () => {
        const doc: Doc = { id: 'simplewiki:1', title: 'April', body: "'''April''' is a month.", kind: 'article', meta: {} }
        const result = parseDoc(doc)
        assert.equal(result.body, 'April is a month.')
    })

    test('falls back to the original body instead of throwing when the parser crashes', () => {
        const body = '[[File:Jichang Royal Garden.jpg|link=[[:en:File:Jichang Royal Garden]].jpg|right|thumb|250x250px|Jichang Yuan]]'
        const doc: Doc = { id: 'simplewiki:584099', title: 'Jichang Garden', body, kind: 'article', meta: {} }

        const result = parseDoc(doc)

        assert.equal(result.body, body)
        assert.equal(result.id, doc.id)
        assert.equal(result.title, doc.title)
    })
})
