import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Explicit rather than relying on RTL's auto-cleanup detection, which only kicks in
// under Vitest's `globals: true` mode - this config imports test globals explicitly.
afterEach(cleanup)
