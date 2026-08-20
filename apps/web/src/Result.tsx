import ReactMarkdown from 'react-markdown'
import type { Result } from './SearchBar.tsx'
import { useState } from 'react'
import './Result.css'

export default function Result({ result }: { result: Result }) {
    const [showSnippet, setShowSnippet] = useState(false)
    const toggleSnippet = () => {
        setShowSnippet(prev => !prev)
    }

    return (
        <div key={result.externalId} className="result-card">
            <h3>{result.title}</h3>
            <button type="button" className="result-snippet-toggle" onClick={toggleSnippet}>
                {showSnippet ? 'Hide snippet' : 'Show snippet'}
            </button>
            {showSnippet && (
                <div className="result-snippet">
                    <ReactMarkdown>{result.snippet}</ReactMarkdown>
                    <a href={`/document/${result.externalId}`}>View Document</a>
                </div>
            )}
        </div>
    )
}