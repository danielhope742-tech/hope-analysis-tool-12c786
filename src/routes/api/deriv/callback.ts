import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/deriv/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const error = url.searchParams.get('error')

        if (error) {
          return new Response('Deriv authorization was not completed.', {
            status: 400,
          })
        }

        return new Response(
          'TickLens callback endpoint exists, but secure OAuth verification and token exchange are not implemented yet.',
          { status: 501 },
        )
      },
    },
  },
})
