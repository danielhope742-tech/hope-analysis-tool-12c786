
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/oauth/callback')({
  component: OAuthCallback,
})

function OAuthCallback() {
  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>TickLens — Deriv Authorization</h1>
      <p>Callback route is now registered.</p>
      <p>Trading authorization is not active yet.</p>
    </main>
  )
}
