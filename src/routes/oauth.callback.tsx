
import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { randomBytes } from 'node:crypto'

export const Route = createFileRoute('/oauth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const bindings = env as {
          DERIV_CLIENT_ID?: string
          OAUTH_KV?: {
            get: (key: string) => Promise<string | null>
            put: (
              key: string,
              value: string,
              options?: { expirationTtl?: number },
            ) => Promise<void>
            delete: (key: string) => Promise<void>
          }
        }

        const kv = bindings.OAUTH_KV
        const clientId = bindings.DERIV_CLIENT_ID
        const url = new URL(request.url)

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        const fail = (message: string, status = 400) =>
          new Response(message, {
            status,
            headers: { 'Cache-Control': 'no-store' },
          })

        if (error) {
          return fail('Deriv authorization was cancelled or failed.')
        }

        if (!kv || !clientId) {
          return fail('OAuth configuration is incomplete.', 500)
        }

        const cookie = request.headers.get('Cookie') ?? ''
        const stateCookie = cookie
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith('ticklens_oauth_state='))
          ?.slice('ticklens_oauth_state='.length)

        if (
          !code ||
          !state ||
          !stateCookie ||
          state !== stateCookie ||
          !/^[a-f0-9]{64}$/.test(state)
        ) {
          return fail('Authorization state check failed. Start again.')
        }

        const saved = await kv.get(`oauth:${state}`)

        if (!saved) {
          return fail('Authorization session expired. Start again.')
        }

        let verifier: string

        try {
          const parsed = JSON.parse(saved) as { verifier?: string }
          if (!parsed.verifier) throw new Error()
          verifier = parsed.verifier
        } catch {
          return fail('Saved authorization data is invalid.', 500)
        }

        // Consume the saved verifier before exchanging the code.
        await kv.delete(`oauth:${state}`)

        const redirectUri = `${url.origin}/oauth/callback`
        const body = new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
        })

        let tokenResponse: Response

        try {
          tokenResponse = await fetch(
            'https://auth.deriv.com/oauth2/token',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
              },
              body,
            },
          )
        } catch {
          return fail('Could not reach Deriv. Please try again.', 502)
        }

        if (!tokenResponse.ok) {
          return fail(
            'Deriv did not accept the token exchange. Check the app settings and OAuth scope, then start again.',
            502,
          )
        }

        let token: {
          access_token?: string
          expires_in?: number
        }

        try {
          token = (await tokenResponse.json()) as {
            access_token?: string
            expires_in?: number
          }
        } catch {
          return fail('Deriv returned an invalid response.', 502)
        }

        if (!token.access_token) {
          return fail('Deriv did not return an access token.', 502)
        }

        const sessionId = randomBytes(32).toString('hex')
        const maxAge = Math.max(
          60,
          Math.min(Number(token.expires_in) || 3600, 86400),
        )

        await kv.put(
          `session:${sessionId}`,
          JSON.stringify({ access_token: token.access_token }),
          { expirationTtl: maxAge },
        )

        return new Response(
          '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>TickLens</title></head><body style="font-family:Arial;padding:24px"><h1>TickLens</h1><p>Deriv authorization completed.</p><p>Your token is stored server-side and is not displayed here. Market analysis and trading features still need to be connected.</p><p>You can return to the TickLens home page.</p><a href="/">Open TickLens</a></body></html>',
          {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'Set-Cookie': `ticklens_session=${sessionId}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`,
            },
          },
        )
      },
    },
  },
})
