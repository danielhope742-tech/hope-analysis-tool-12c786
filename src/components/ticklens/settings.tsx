import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_APP_ID,
  DEFAULT_ENDPOINT,
  LEGACY_ENDPOINT,
  PUBLIC_DEMO_APP_ID,
  type DerivSettings,
} from '@/lib/deriv'

const STORAGE_KEY = 'ticklens.settings'

export const DEFAULT_SETTINGS: DerivSettings = {
  appId: DEFAULT_APP_ID,
  endpoint: DEFAULT_ENDPOINT,
}

/** Connection settings persisted in localStorage (loaded after mount to stay SSR-safe). */
export function useSettings() {
  const [settings, setSettings] = useState<DerivSettings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? 'null',
      ) as Partial<DerivSettings> | null
      if (saved?.appId) {
        const next = { ...DEFAULT_SETTINGS, ...saved }
        // Earlier versions saved the legacy endpoint, which rejects new (non-numeric) app IDs.
        if (
          next.endpoint.startsWith(LEGACY_ENDPOINT) &&
          !/^\d+$/.test(next.appId)
        )
          next.endpoint = DEFAULT_ENDPOINT
        setSettings(next)
      }
    } catch {
      // ignore corrupt settings
    }
    setReady(true)
  }, [])

  const save = (next: DerivSettings) => {
    setSettings(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  return { settings, save, ready }
}

export function SettingsDialog({
  settings,
  onSave,
  open,
  onOpenChange,
}: {
  settings: DerivSettings
  onSave: (s: DerivSettings) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [appId, setAppId] = useState(settings.appId)
  const [endpoint, setEndpoint] = useState(settings.endpoint)

  useEffect(() => {
    if (open) {
      setAppId(settings.appId)
      setEndpoint(settings.endpoint)
    }
  }, [open, settings])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 /> Connection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deriv connection</DialogTitle>
          <DialogDescription>
            TickLens streams ticks directly from Deriv using your app ID. Tick
            streams and tick history are public, so no API token is needed.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            onSave({
              appId: appId.trim(),
              endpoint: endpoint.trim() || DEFAULT_ENDPOINT,
            })
            onOpenChange(false)
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="app-id">App ID</Label>
            <Input
              id="app-id"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              required
              className="tabular"
            />
            <p className="text-xs text-muted-foreground">
              Register your own at developers.deriv.com. If yours is rejected,
              try Deriv’s public demo ID{' '}
              <button
                type="button"
                className="tabular text-primary underline"
                onClick={() => setAppId(PUBLIC_DEMO_APP_ID)}
              >
                {PUBLIC_DEMO_APP_ID}
              </button>
              .
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endpoint">WebSocket endpoint</Label>
            <Input
              id="endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="tabular"
            />
            <p className="text-xs text-muted-foreground">
              App IDs from developers.deriv.com need the default endpoint. Older
              numeric app IDs also work on the legacy{' '}
              <span className="tabular">{LEGACY_ENDPOINT}</span>.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSave(DEFAULT_SETTINGS)}
            >
              Reset to default
            </Button>
            <Button type="submit">Save & reconnect</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
