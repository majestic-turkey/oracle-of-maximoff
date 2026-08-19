import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App.tsx'

describe('App', () => {
  test('renders the heading and the search bar', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /oracle of maximoff/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
  })
})
