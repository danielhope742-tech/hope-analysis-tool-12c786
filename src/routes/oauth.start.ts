import { createFileRoute } from '@tanstack/react-router'
import { randomBytes, createHash } from 'node:crypto'

export const Route = createFileRoute('/oauth/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.DERIV_CLIENT_ID

        if (!clientId) {
          return new Response('Deriv client ID is not configured.', {
            status: 500,
          })
        }

        const state = randomBytes(32).toString('hex')
        const verifier = randomBytes(32).toString('base64url')
        const challenge = createHash('sha256')
          .update(verifier)
          .digest('base64url')

        const url = new URL(request.url)
        const redirectUri = `${url.origin}/oauth/callback`

        // Temporary diagnostic: KV storage is wired in the next step.
        return Response.redirect(
          `https://auth.deriv.com/oauth2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`,
          302,
        )
      },
    },
  },
})
