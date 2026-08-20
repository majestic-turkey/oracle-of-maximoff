import './App.css'
import SearchBar from './SearchBar.tsx'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-kicker">Search the corpus</p>
        <h1>Welcome to the Oracle of Maximoff</h1>
      </header>
      <SearchBar />
    </div>
  )
}

export default App