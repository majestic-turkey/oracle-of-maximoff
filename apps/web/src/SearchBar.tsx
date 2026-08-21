import { useEffect, useRef, useState } from 'react'
import Result from './Result.tsx'

export interface Result {
  title: string
  snippet: string
  externalId: string
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [elapsed, setElapsed] = useState<number | null>(null)
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = async (topK: number, searchQuery: string) => {
    const before = performance.now()
    const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&topk=${topK}`)
    const { results } = await response.json()
    const after = performance.now()
    const elapsed = after - before
    setResults(results)
    setElapsed(elapsed)
  }

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current)
      }
    }
  }, [])

  const handleType = (nextQuery: string) => {
    const delay = 100 // milliseconds
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
    }
    timeoutIdRef.current = setTimeout(() => {
      handleSearch(5, nextQuery)
    }, delay)
  }

  return (
    <div className="search-panel">
      <div className="search-input-row">
        <input
          className="search-input"
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => {
            const nextQuery = e.target.value
            setQuery(nextQuery)
            handleType(nextQuery)
          }}
        />
        <button className="search-button" onClick={() => handleSearch(25, query)}>
          Search
        </button>
      </div>
      <div id="results" className="results-list">
        {results.map((result) => (
          <Result key={result.externalId} result={result} />
        ))}
      </div>
      <p className="search-elapsed-time">Search took: {elapsed?.toFixed(2)} ms</p>
    </div>
  )
}