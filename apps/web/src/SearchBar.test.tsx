import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchBar from './SearchBar.tsx'

// SearchBar renders results by hand-building innerHTML into #results rather than
// through React state, so these tests read the real DOM back rather than props/state.
function mockFetchOnce(results: unknown[]) {
  return vi.fn().mockResolvedValue({ json: async () => ({ results }) })
}

describe('SearchBar', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('typing updates the input value', async () => {
    const user = userEvent.setup()
    render(<SearchBar />)

    const input = screen.getByPlaceholderText('Search...')
    await user.type(input, 'whales')

    expect(input).toHaveValue('whales')
  })

  test('clicking Search fetches /api/search with the URL-encoded query', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', mockFetchOnce([]))
    render(<SearchBar />)

    await user.type(screen.getByPlaceholderText('Search...'), 'blue whale')
    await user.click(screen.getByRole('button', { name: /search/i }))

    expect(fetch).toHaveBeenCalledWith('/api/search?q=blue%20whale')
  })

  test("renders each result's title, markdown-rendered snippet, and document link", async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', mockFetchOnce([
      { title: 'Whales', snippet: 'a **big** ocean mammal', externalId: 'simplewiki:123' },
    ]))
    render(<SearchBar />)

    await user.click(screen.getByRole('button', { name: /search/i }))

    expect(await screen.findByRole('heading', { name: 'Whales', level: 3 })).toBeInTheDocument()
    // The snippet is markdown ("**big**"), not plain text - confirm it actually
    // got parsed into a real <strong>, not dropped in as a literal asterisked string.
    expect(screen.getByText('big').tagName).toBe('STRONG')
    expect(screen.getByRole('link', { name: /view document/i })).toHaveAttribute('href', '/document/simplewiki:123')
  })

  test('a second search clears the previous results before rendering the new ones', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ results: [{ title: 'First', snippet: 'one', externalId: '1' }] }) })
      .mockResolvedValueOnce({ json: async () => ({ results: [{ title: 'Second', snippet: 'two', externalId: '2' }] }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<SearchBar />)

    const searchButton = screen.getByRole('button', { name: /search/i })
    await user.click(searchButton)
    expect(await screen.findByText('First')).toBeInTheDocument()

    await user.click(searchButton)
    expect(await screen.findByText('Second')).toBeInTheDocument()
    expect(screen.queryByText('First')).not.toBeInTheDocument()
  })

})
