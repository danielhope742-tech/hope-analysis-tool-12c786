
import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { randomBytes, createHash } from 'node:crypto'

export const Route = createFileRoute('/oauth/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const bindings = env as {
          DERIV_CLIENT_ID?: string
          OAUTH_KV?: {
            put: (
              key: string,
              value: string,
              options?: { expirationTtl?: number },
            ) => Promise<void>
          }
        }

        const clientId = bindings.DERIV_CLIENT_ID
        const kv = bindings.OAUTH_KV

        if (!clientId || !kv) {
          return new Response('OAuth configuration is incomplete.', {
            status: 500,
          })
        }

        const state = randomBytes(32).toString('hex')
        const verifier = randomBytes(32).toString('base64url')
        const challenge = createHash('sha256')
          .update(verifier)
          .digest('base64url')

        await kv.put(
          `oauth:${state}`,
          JSON.stringify({ verifier }),
          { expirationTtl: 600 },
        )

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

        return new Response(null, {
          status: 302,
          headers: {
            Location: authorizeUrl.toString(),
            'Set-Cookie':
              `ticklens_oauth_state=${state}; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
