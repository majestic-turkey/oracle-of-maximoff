/// <reference types="node" />
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { extractDocs } from '../src/corpora/parseXML.ts'
import type { Doc } from '../src/types.ts'

const collect = async (xml: string): Promise<Doc[]> => {
    const docs: Doc[] = []
    await extractDocs(Readable.from([xml]), (doc) => docs.push(doc))
    return docs
}

const page = (inner: string) => `<mediawiki><page>${inner}</page></mediawiki>`

describe('extractDocs()', () => {
    test('extracts title, id, and revision text into a Doc', async () => {
        const docs = await collect(page(`
            <title>April</title>
            <ns>0</ns>
            <id>42</id>
            <revision>
                <id>999</id>
                <contributor><username>someone</username><id>1</id></contributor>
                <text>Hello world</text>
            </revision>
        `))

        assert.deepEqual(docs, [
            { id: 'simplewiki:42', title: 'April', body: 'Hello world', kind: 'article', meta: {} },
        ])
    })

    test('uses the page-level <id>, not the revision or contributor id', async () => {
        const docs = await collect(page(`
            <title>Test</title>
            <ns>0</ns>
            <id>7</id>
            <revision>
                <id>555</id>
                <contributor><username>someone</username><id>3</id></contributor>
                <text>body</text>
            </revision>
        `))

        assert.equal(docs[0]!.id, 'simplewiki:7')
    })

    test('skips pages that are redirects', async () => {
        const docs = await collect(page(`
            <title>USA</title>
            <ns>0</ns>
            <id>7</id>
            <redirect title="United States" />
            <revision><text>#REDIRECT [[United States]]</text></revision>
        `))

        assert.deepEqual(docs, [])
    })

    test('skips pages outside namespace 0', async () => {
        const docs = await collect(page(`
            <title>Talk:Test</title>
            <ns>1</ns>
            <id>8</id>
            <revision><text>discussion</text></revision>
        `))

        assert.deepEqual(docs, [])
    })

    test('a skipped page does not corrupt parsing of later pages', async () => {
        const xml = `<mediawiki>
            ${`<page>
                <title>Talk:Test</title>
                <ns>1</ns>
                <id>8</id>
                <revision><text>discussion</text></revision>
            </page>`}
            ${`<page>
                <title>May</title>
                <ns>0</ns>
                <id>9</id>
                <revision><text>Fifth month</text></revision>
            </page>`}
        </mediawiki>`
        const docs: Doc[] = []
        await extractDocs(Readable.from([xml]), (doc) => docs.push(doc))

        assert.deepEqual(docs, [
            { id: 'simplewiki:9', title: 'May', body: 'Fifth month', kind: 'article', meta: {} },
        ])
    })

    test('extracts multiple articles from one stream', async () => {
        const xml = `<mediawiki>
            ${`<page><title>A</title><ns>0</ns><id>1</id><revision><text>first</text></revision></page>`}
            ${`<page><title>B</title><ns>0</ns><id>2</id><revision><text>second</text></revision></page>`}
        </mediawiki>`
        const docs: Doc[] = []
        await extractDocs(Readable.from([xml]), (doc) => docs.push(doc))

        assert.deepEqual(docs.map((d) => d.id), ['simplewiki:1', 'simplewiki:2'])
        assert.deepEqual(docs.map((d) => d.body), ['first', 'second'])
    })
})
