import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/oauth/callback')({
  component: OAuthCallback,
})

function OAuthCallback() {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')

  return (
    <main style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>TickLens — Deriv Authorization</h1>
      {error ? (
        <p>Deriv authorization error: {error}</p>
      ) : (
        <p>Callback route is loading. Account authorization is not implemented yet.</p>
      )}
    </main>
  )
}
