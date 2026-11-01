import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { createHash, randomBytes } from 'node:crypto'

export const Route = createFileRoute('/oauth/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)

        const workerEnv = env as unknown as {
          DERIV_CLIENT_ID?: string
          OAUTH_KV?: {
            put: (
              key: string,
              value: string,
              options?: { expirationTtl?: number },
            ) => Promise<void>
          }
        }

        const clientId = workerEnv.DERIV_CLIENT_ID
        const kv = workerEnv.OAUTH_KV

        if (!clientId || !kv) {
          return new Response(
            'OAuth setup incomplete. Check DERIV_CLIENT_ID and OAUTH_KV in Cloudflare.',
            {
              status: 500,
              headers: { 'Cache-Control': 'no-store' },
            },
          )
        }

        try {
          // Generate a secure OAuth state and PKCE verifier.
          const state = randomBytes(32).toString('hex')
          const verifier = randomBytes(64).toString('base64url')

          // Create the SHA-256 PKCE challenge.
          const challenge = createHash('sha256')
            .update(verifier)
            .digest('base64url')

          const redirectUri = `${url.origin}/oauth/callback`

          // Store the verifier temporarily for the callback.
          await kv.put(
            `oauth:${state}`,
            JSON.stringify({ verifier }),
            { expirationTtl: 600 },
          )

          const authUrl = new URL('https://auth.deriv.com/oauth2/auth')

          authUrl.searchParams.set('response_type', 'code')
          authUrl.searchParams.set('client_id', clientId)
          authUrl.searchParams.set('redirect_uri', redirectUri)
          authUrl.searchParams.set('scope', 'trade')
          authUrl.searchParams.set('state', state)
          authUrl.searchParams.set('code_challenge', challenge)
          authUrl.searchParams.set('code_challenge_method', 'S256')

          const headers = new Headers({
            Location: authUrl.toString(),
            'Cache-Control': 'no-store',
          })

          headers.append(
            'Set-Cookie',
            `ticklens_oauth_state=${state}; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax`,
          )

          return new Response(null, {
            status: 302,
            headers,
          })
        } catch (error) {
          console.error('OAuth start error:', error)

          return new Response('Unable to start Deriv authorization.', {
            status: 500,
            headers: { 'Cache-Control': 'no-store' },
          })
        }
      },
    },
  },
})
