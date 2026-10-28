
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/oauth/callback')({
  component: OAuthCallback,
})

function OAuthCallback() {
  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>TickLens — Deriv Authorization</h1>
      <p>This page is ready for the Deriv authorization callback.</p>
      <p>
        Account authorization is not complete yet. No trading will happen
        from this page alone.
      </p>
    </main>
  )
}
