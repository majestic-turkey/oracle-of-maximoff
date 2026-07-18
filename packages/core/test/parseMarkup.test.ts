/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { wikitextToPlainText } from '../src/corpora/parseMarkup.ts'

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
})
