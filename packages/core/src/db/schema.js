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
