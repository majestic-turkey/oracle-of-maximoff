import { marked } from 'marked'
import { useState } from 'react'

interface Result {
  title: string
  snippet: string
  externalId: string
}

export default function SearchBar() {
  const [query, setQuery] = useState('')

  const handleSearch = async () => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const { results } = await response.json()
    console.log('Search results:', results)
    const resultsDiv = document.getElementById('results')
    if (resultsDiv) {
        resultsDiv.innerHTML = ''
        results.map((result: Result) => {
            const resultElement = document.createElement('div')
            resultElement.innerHTML = `
                <h3>${result.title}</h3>
                <p>${marked.parse(result.snippet)}</p>
                <a href="/document/${result.externalId}">View Document</a>
            `
            resultsDiv.appendChild(resultElement)
        })
    }
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
    <div id="results"></div>
  </>)
}