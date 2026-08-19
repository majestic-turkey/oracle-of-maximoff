// Schema definition for the search index. Deliberately takes a database handle rather
// than importing db.js: that keeps this module free of import-time side effects, so the
// test suite can build the real schema against a throwaway :memory: database instead of
// re-declaring the DDL and hoping the copy stays in sync.

const DOCUMENTS = `
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        kind TEXT NOT NULL,
        meta TEXT,
        token_count INTEGER,
        external_id TEXT NOT NULL UNIQUE
    )
`

const TERMS = `
    CREATE TABLE IF NOT EXISTS terms (
        id INTEGER PRIMARY KEY,
        term TEXT NOT NULL UNIQUE
    )
`

const POSTINGS = `
    CREATE TABLE IF NOT EXISTS postings (
        id INTEGER PRIMARY KEY,
        term_id INTEGER NOT NULL references terms(id),
        doc_id INTEGER NOT NULL references documents(id),
        frequency INTEGER NOT NULL,
        positions TEXT,
        UNIQUE(term_id, doc_id)
    )
`

// Per-document token counts, split out of `documents` purely so BM25 can read them
// cheaply. Joining `documents` for token_count means a rowid lookup into rows averaging
// 1.7KB of article body — roughly two rows per 4KB page — so scoring a common term costs
// tens of thousands of near-random page reads to collect one integer each. These rows are
// ~10 bytes, so the same lookups stay in a handful of pages.
//
// Deliberately a table and not an index on documents(id, token_count): because `id` is the
// rowid, SQLite treats the rowid lookup as optimal and ignores such an index entirely
// until ANALYZE has populated sqlite_stat1. This shape does not depend on the cost model.
const DOC_LENGTHS = `
    CREATE TABLE IF NOT EXISTS doc_lengths (
        doc_id INTEGER PRIMARY KEY,
        token_count INTEGER NOT NULL
    )
`

// Same upsert in both triggers so a row is repaired if it ever goes missing, and so the
// ON CONFLICT DO UPDATE path in ingest (a re-run over an existing corpus) is covered.
// No foreign key onto documents: an AFTER DELETE trigger runs after the constraint check,
// so a reference here would block the very delete that is meant to clean it up.
const DOC_LENGTHS_TRIGGERS = `
    CREATE TRIGGER IF NOT EXISTS doc_lengths_after_document_insert
    AFTER INSERT ON documents
    BEGIN
        INSERT INTO doc_lengths (doc_id, token_count)
        VALUES (NEW.id, COALESCE(NEW.token_count, 0))
        ON CONFLICT(doc_id) DO UPDATE SET token_count = excluded.token_count;
    END;

    CREATE TRIGGER IF NOT EXISTS doc_lengths_after_document_update
    AFTER UPDATE ON documents
    BEGIN
        INSERT INTO doc_lengths (doc_id, token_count)
        VALUES (NEW.id, COALESCE(NEW.token_count, 0))
        ON CONFLICT(doc_id) DO UPDATE SET token_count = excluded.token_count;
    END;

    CREATE TRIGGER IF NOT EXISTS doc_lengths_after_document_delete
    AFTER DELETE ON documents
    BEGIN
        DELETE FROM doc_lengths WHERE doc_id = OLD.id;
    END;
`

// Corpus-wide counters BM25 needs on every query. Computing avgdl as AVG(token_count)
// instead means a full scan of `documents` per query, and because that table holds the
// article bodies it drags every page of the database through memory to average one
// integer column (~420ms on the simplewiki index).
// Kept as a running sum rather than a stored average so it stays exact under updates.
const INDEX_STATS = `
    CREATE TABLE IF NOT EXISTS index_stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        doc_count INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0
    )
`

const INDEX_STATS_SEED = `
    INSERT OR IGNORE INTO index_stats (id, doc_count, total_tokens) VALUES (1, 0, 0);
`

// Maintained by triggers rather than by the ingest loop so the counters can never drift
// from `documents` — including when an ingest is interrupted partway through, since the
// trigger fires inside the same transaction as the write that caused it. The UPDATE
// trigger matters more than it looks: re-running ingest over an existing database takes
// the ON CONFLICT DO UPDATE path, so old token counts have to be backed out.
const INDEX_STATS_TRIGGERS = `
    CREATE TRIGGER IF NOT EXISTS index_stats_after_document_insert
    AFTER INSERT ON documents
    BEGIN
        UPDATE index_stats
        SET doc_count = doc_count + 1,
            total_tokens = total_tokens + COALESCE(NEW.token_count, 0)
        WHERE id = 1;
    END;

    CREATE TRIGGER IF NOT EXISTS index_stats_after_document_update
    AFTER UPDATE ON documents
    BEGIN
        UPDATE index_stats
        SET total_tokens = total_tokens - COALESCE(OLD.token_count, 0) + COALESCE(NEW.token_count, 0)
        WHERE id = 1;
    END;

    CREATE TRIGGER IF NOT EXISTS index_stats_after_document_delete
    AFTER DELETE ON documents
    BEGIN
        UPDATE index_stats
        SET doc_count = doc_count - 1,
            total_tokens = total_tokens - COALESCE(OLD.token_count, 0)
        WHERE id = 1;
    END;
`

// Everything is IF NOT EXISTS / OR IGNORE, so this is safe to run against an existing
// database as well as an empty one.
export function createSchema(db) {
    db.exec(DOCUMENTS)
    db.exec(TERMS)
    db.exec(POSTINGS)
    db.exec(INDEX_STATS)
    db.exec(INDEX_STATS_SEED)
    db.exec(INDEX_STATS_TRIGGERS)
    db.exec(DOC_LENGTHS)
    db.exec(DOC_LENGTHS_TRIGGERS)
}

// Recomputes the counters from `documents` in one pass. The triggers keep them correct
// from here on, so this is only needed to backfill a database indexed before the
// index_stats table existed — a from-scratch ingest never needs it.
export function refreshIndexStats(db) {
    db.prepare(`
        INSERT INTO index_stats (id, doc_count, total_tokens)
        -- "WHERE true" is required, not decorative: when an upsert hangs off an
        -- INSERT..SELECT, SQLite cannot tell the upsert's ON from a join's ON without
        -- a WHERE clause terminating the SELECT. https://sqlite.org/lang_upsert.html
        SELECT 1, COUNT(*), COALESCE(SUM(token_count), 0) FROM documents WHERE true
        ON CONFLICT(id) DO UPDATE SET
            doc_count = excluded.doc_count,
            total_tokens = excluded.total_tokens
    `).run()
}

// Rebuilds doc_lengths from `documents` in one pass. Like refreshIndexStats, this is only
// needed to backfill a database indexed before the table existed; the triggers keep it in
// step from then on, and a from-scratch ingest never needs it.
export function refreshDocLengths(db) {
    db.prepare(`
        INSERT INTO doc_lengths (doc_id, token_count)
        SELECT id, COALESCE(token_count, 0) FROM documents WHERE true
        ON CONFLICT(doc_id) DO UPDATE SET token_count = excluded.token_count
    `).run()
}
