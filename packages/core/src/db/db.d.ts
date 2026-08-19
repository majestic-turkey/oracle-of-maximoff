interface QueryableDb {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
  }
}

declare const db: QueryableDb
export default db

export function stats(): {
  termCount: number
  postingCount: number
  avgDocLength: number | null
}
