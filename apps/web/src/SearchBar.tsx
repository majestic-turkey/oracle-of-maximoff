import { useRef, useState } from 'react'
import Result from './Result.tsx'

export interface Result {
  title: string
  snippet: string
  externalId: string
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = async (topK: number) => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&topk=${topK}`)
    const { results } = await response.json()
    setResults(results)
  }

  const handleType = () => {
    const delay = 100 // milliseconds
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
    }
    timeoutIdRef.current = setTimeout(() => {
      handleSearch(5)
    }, delay)
  }

  return (<>
    <div>
      <input
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          handleType()}}
      />
      <button onClick={() => handleSearch(25)}>Search</button>
    </div>
    <div id="results">
      {results.map((result) => (
        <Result key={result.externalId} result={result} />
      ))}
    </div>
  </>)
}