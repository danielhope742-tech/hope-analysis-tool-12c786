
import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { randomBytes, createHash } from 'node:crypto'

export const Route = createFileRoute('/oauth/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = (env as { DERIV_CLIENT_ID?: string }).DERIV_CLIENT_ID

        if (!clientId) {
          return new Response(
            'DERIV_CLIENT_ID is missing from the Cloudflare Worker environment.',
            { status: 500 },
          )
        }

        const state = randomBytes(32).toString('hex')
        const verifier = randomBytes(32).toString('base64url')
        const challenge = createHash('sha256')
          .update(verifier)
          .digest('base64url')

        const redirectUri =
          `${new URL(request.url).origin}/oauth/callback`

        const authorizeUrl = new URL(
          'https://auth.deriv.com/oauth2/auth',
        )

        authorizeUrl.searchParams.set('response_type', 'code')
        authorizeUrl.searchParams.set('client_id', clientId)
        authorizeUrl.searchParams.set('redirect_uri', redirectUri)
        authorizeUrl.searchParams.set('state', state)
        authorizeUrl.searchParams.set('code_challenge', challenge)
        authorizeUrl.searchParams.set('code_challenge_method', 'S256')

        return Response.redirect(authorizeUrl.toString(), 302)
      },
    },
  },
})
