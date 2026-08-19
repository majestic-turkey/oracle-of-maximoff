import db, { stats } from "./db.js"

interface QueryableDb {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
  }
}

export default db as QueryableDb
export { stats }
