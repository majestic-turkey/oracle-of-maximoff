import { useState } from 'react'

export default function SearchBar() {
  const [query, setQuery] = useState('')

  const handleSearch = async () => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const data = await response.json()
    console.log('Search results:', data)
  }

  return (
    <div>
      <input
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button onClick={handleSearch}>Search</button>
    </div>
  )
}