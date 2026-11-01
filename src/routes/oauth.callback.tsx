
import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { randomBytes } from 'node:crypto'

interface DerivAccount {
  account_id?: string
  balance?: number | string
  currency?: string
  account_type?: string
  status?: string
}

interface DerivAccountsResponse {
  data?: DerivAccount[] | DerivAccount
}

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

        const clearStateCookie =
          'ticklens_oauth_state=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax'

        const fail = (message: string, status = 400) =>
          new Response(
            `<!doctype html>
            <html>
              <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>TickLens connection</title>
              </head>
              <body style="font-family:Arial;padding:24px">
                <h2>TickLens connection failed</h2>
                <p>${message}</p>
                <a href="/">Return to TickLens</a>
              </body>
            </html>`,
            {
              status,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'Set-Cookie': clearStateCookie,
              },
            },
          )

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
          const parsed = JSON.parse(saved) as {
            verifier?: string
          }

          if (!parsed.verifier) {
            throw new Error('Missing verifier')
          }

          verifier = parsed.verifier
        } catch {
          return fail('Saved authorization data is invalid.', 500)
        }

        // Consume the authorization session before exchanging the code.
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
            'Deriv rejected the token exchange. Check your Client ID, redirect URL and PKCE settings.',
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
          return fail('Deriv returned an invalid token response.', 502)
        }

        if (!token.access_token) {
          return fail('Deriv did not return an access token.', 502)
        }

        // Retrieve the accounts associated with this OAuth login.
        let accountsResponse: Response

        try {
          accountsResponse = await fetch(
            'https://api.derivws.com/trading/v1/options/accounts',
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token.access_token}`,
                Accept: 'application/json',
              },
            },
          )
        } catch {
          return fail(
            'Login succeeded, but TickLens could not retrieve your Deriv accounts.',
            502,
          )
        }

        if (!accountsResponse.ok) {
          return fail(
            'Login succeeded, but Deriv did not allow account retrieval. Check that your OAuth application has the trade scope.',
            502,
          )
        }

        let accountsResult: DerivAccountsResponse

        try {
          accountsResult =
            (await accountsResponse.json()) as DerivAccountsResponse
        } catch {
          return fail('Deriv returned an invalid account response.', 502)
        }

        const accountList = Array.isArray(accountsResult.data)
          ? accountsResult.data
          : accountsResult.data
            ? [accountsResult.data]
            : []

        // This version deliberately selects DEMO only.
        const demoAccount = accountList.find(
          (account) =>
            account.account_type?.toLowerCase() === 'demo' &&
            account.account_id,
        )

        if (!demoAccount) {
          return fail(
            'Your Deriv login succeeded, but no Options Demo account was returned. No real account will be selected.',
            404,
          )
        }

        const sessionId = randomBytes(32).toString('hex')

        const tokenLifetime = Number(token.expires_in) || 3600
        const maxAge = Math.max(
          60,
          Math.min(tokenLifetime, 30 * 24 * 60 * 60),
        )

        const session = {
          access_token: token.access_token,
          expires_at: Date.now() + tokenLifetime * 1000,
          account: {
            account_id: demoAccount.account_id,
            balance: demoAccount.balance ?? null,
            currency: demoAccount.currency ?? '',
            account_type: 'demo',
          },
        }

        try {
          await kv.put(
            `session:${sessionId}`,
            JSON.stringify(session),
            { expirationTtl: maxAge },
          )
        } catch {
          return fail('Could not securely save your session.', 500)
        }

        const escapeHtml = (value: unknown) =>
          String(value ?? '').replace(/[&<>"']/g, (character) => {
            const replacements: Record<string, string> = {
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            }

            return replacements[character]
          })

        const accountId = escapeHtml(demoAccount.account_id)
        const balance = escapeHtml(
          demoAccount.balance === undefined
            ? 'Not supplied'
            : Number(demoAccount.balance).toLocaleString(),
        )
        const currency = escapeHtml(demoAccount.currency || 'Unknown')

        return new Response(
          `<!doctype html>
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>TickLens connected</title>
            </head>
            <body style="font-family:Arial,sans-serif;padding:24px;max-width:480px;margin:auto">
              <h1>TickLens</h1>
              <h2 style="color:green">Demo account connected</h2>
              <p><strong>Account type:</strong> DEMO</p>
              <p><strong>Account ID:</strong> ${accountId}</p>
              <p><strong>Balance:</strong> ${balance} ${currency}</p>
              <p>Your access token is stored securely on the server and is not displayed.</p>
              <a href="/" style="display:inline-block;padding:12px 18px;background:#16834a;color:white;text-decoration:none;border-radius:8px">
                Return to TickLens
              </a>
            </body>
          </html>`,
          {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'Set-Cookie': [
                `ticklens_session=${sessionId}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`,
                clearStateCookie,
              ].join(', '),
            },
          },
        )
      },
    },
  },
})
