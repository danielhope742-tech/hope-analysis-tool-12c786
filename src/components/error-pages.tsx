
import {
  Link,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main className="grid min-h-svh place-items-center px-6 py-16">
      <div className="max-w-md space-y-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-muted-foreground">
          This page doesn’t exist. Check the address or return to the home page.
        </p>
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </main>
  )
}

export function RouteErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  const details =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
      : String(error ?? 'Unknown runtime error')

  return (
    <main className="grid min-h-svh place-items-center px-6 py-16">
      <div className="w-full max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">
          TickLens error details
        </h1>
        <p role="alert" className="text-muted-foreground">
          Copy the error below for diagnosis.
        </p>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border p-3 text-sm">
          {details}
        </pre>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              void router.invalidate()
              reset()
            }}
          >
            Try again
          </Button>
          <Button variant="outline" asChild>
            <a href="/">Go home</a>
          </Button>
        </div>
      </div>
    </main>
  )
}
