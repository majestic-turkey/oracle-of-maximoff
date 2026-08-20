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

const DOC_LENGTHS = `
    CREATE TABLE IF NOT EXISTS doc_lengths (
        doc_id INTEGER PRIMARY KEY,
        token_count INTEGER NOT NULL
    )
`

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
// database as well as an empty one
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


export function refreshDocLengths(db) {
    db.prepare(`
        INSERT INTO doc_lengths (doc_id, token_count)
        SELECT id, COALESCE(token_count, 0) FROM documents WHERE true
        ON CONFLICT(doc_id) DO UPDATE SET token_count = excluded.token_count
    `).run()
}
