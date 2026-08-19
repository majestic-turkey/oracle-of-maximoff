import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface Result {
  title: string
  snippet: string
  externalId: string
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])

  const handleSearch = async () => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const { results } = await response.json()
    setResults(results)
  }

  return (<>
    <div>
      <input
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button onClick={handleSearch}>Search</button>
    </div>
    <div id="results">
      {results.map((result) => (
        <div key={result.externalId}>
          <h3>{result.title}</h3>
          <ReactMarkdown>{result.snippet}</ReactMarkdown>
          <a href={`/document/${result.externalId}`}>View Document</a>
        </div>
      ))}
    </div>
  </>)
}