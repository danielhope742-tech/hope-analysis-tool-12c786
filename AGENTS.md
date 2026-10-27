# AGENTS.md

This document describes the project for developers and AI agents working on this codebase.

## Project Overview

**TickLens** is a client-side analysis tool for Deriv synthetic markets (Volatility, Volatility 1s, Jump, Crash/Boom, etc.). The browser opens a WebSocket to the Deriv API (`wss://api.derivws.com/trading/v1/options/ws/public?app_id=…`, the Options API public channel; message format is the same as legacy v3), loads tick history with `ticks_history` + `subscribe: 1`, and keeps a rolling window updated from the live tick stream. Everything — last-digit probabilities, even/odd, over/under, rise/fall, streaks, digit gaps, the next-digit prediction and its live accuracy — is computed in the browser. There is no backend, database or auth: tick data is public and needs only an app ID.

The whole product is one page (`/`) with two sections:

- **Analyzer** — choose a market, history window and over/under barrier, then Start/Stop. Shows live price + chart, prediction card, digit distribution, split bars and the recent digit stream.
- **All synthetic markets scanner** — streams every synthetic market at once (500 ticks each) and ranks them by digit bias, prediction confidence, even/odd skew or over/under share. Clicking a row loads that market into the analyzer.

### Non-obvious decisions

- **Two sockets.** The analyzer and the scanner use separate `DerivClient` instances so both can stream the same symbol without Deriv's `AlreadySubscribed` error.
- **Last digit** is taken from `quote.toFixed(pip_size)` — raw numbers drop trailing zeros. `pip_size` comes from the history/tick response, falling back to the market list.
- **Market list** is loaded from `active_symbols` (filtered to `synthetic_index`); `src/lib/markets.ts` holds a fallback list and the preferred sort order.
- **App ID** defaults to the owner's ID in `src/lib/deriv.ts` (`DEFAULT_APP_ID`) and can be changed in the Connection dialog (saved to `localStorage` under `ticklens.settings`). `1089` is Deriv's public demo ID. New developers.deriv.com app IDs (alphanumeric) are rejected at handshake by the legacy `wss://ws.derivws.com/websockets/v3`; saved settings pointing there with a non-numeric ID are migrated to the new endpoint. The new `active_symbols` returns `underlying_symbol`/`pip_size`/submarket codes and rejects `product_type`; `marketsFromActiveSymbols` accepts both shapes.
- **Prediction model** (`predictNextDigit` in `src/lib/analysis.ts`) blends long-window frequency (25%), last-50 frequency (30%), first-order Markov transition from the current digit (30%) and digit gap/absence (15%). Accuracy is measured live against the 10% / 30% / 50% random baselines. Synthetic indices are RNG-driven, so the UI presents this as a statistical estimate, never a guarantee.
- The scanner re-renders at most once per second; the analyzer re-renders per tick.
- Dark theme is forced (`className="dark"` on `<html>`); palette lives in the `.dark` block in `src/styles.css`, with extra `--up`, `--down`, `--warn` tokens (`text-up`, `bg-down`, …).

### Tech Stack

| Layer         | Technology                                          |
| ------------- | --------------------------------------------------- |
| Framework     | TanStack Start                                      |
| Frontend      | React 19, TanStack Router                           |
| Build         | Vite 8                                              |
| Styling       | Tailwind CSS 4, theme variables in `src/styles.css` |
| UI Components | shadcn/ui (Radix UI + Tailwind)                     |
| Toasts        | sonner                                              |
| Icons         | lucide-react                                        |
| Language      | TypeScript 6.0 (strict mode)                        |
| Deployment    | Netlify, via `@netlify/vite-plugin-tanstack-start`  |

## Directory Structure

```
├── src
│   ├── components
│   │   ├── ticklens
│   │   │   ├── analyzer.tsx  # Single-market analysis screen (controls, prediction, distribution, stats).
│   │   │   ├── scanner.tsx   # All-markets scanner table with ranking.
│   │   │   ├── charts.tsx    # TickChart (SVG line), DigitDistribution, SplitBar.
│   │   │   └── settings.tsx  # Connection dialog + useSettings (localStorage).
│   │   ├── error-pages.tsx
│   │   └── ui              # shadcn/ui components.
│   ├── hooks
│   │   └── use-deriv.ts    # useDerivConnection, useSyntheticMarkets, useTickFeed, useMarketScanner.
│   ├── lib
│   │   ├── deriv.ts        # DerivClient (WebSocket, req_id routing, subscribe/forget, ping, backoff) + lastDigit.
│   │   ├── analysis.ts     # Pure statistics + next-digit prediction (unit-tested in analysis.test.ts).
│   │   └── markets.ts      # Synthetic market fallback list + active_symbols mapping.
│   ├── routes
│   │   ├── __root.tsx      # HTML shell, metadata, fonts (Space Grotesk, JetBrains Mono).
│   │   └── index.tsx       # The TickLens page: wires settings, sockets, analyzer and scanner.
│   └── styles.css          # Theme tokens.
├── netlify.toml
└── vite.config.ts
```

`src/routeTree.gen.ts` is generated by the router plugin when the dev server or build runs. Don't edit it.

Shared framework skill source lives in `frameworks/tanstack-start-react/.claude/skills` in this repository, separate from the standalone starter. Consult the matching framework/Netlify skills when available in a generated app; don't assume the starter contains a `.claude` directory.

## Key Concepts

### File-Based Routing

Route files in `src/routes/` define pages and endpoints:

- `__root.tsx` wraps every page.
- `index.tsx` is `/`.
- `about.tsx` would be `/about`.
- `api.*.ts` files are server API endpoints. See the `tanstack-start-api-routes` skill.

### Theme Variables

Colors and corner radius are CSS variables in `src/styles.css` (`--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--radius`, and more), with a second set under `.dark`. Tailwind exposes them as classes such as `bg-primary`, `text-muted-foreground`, and `border-border`.

Set these variables for the product before you build any page. In components, use the variable classes instead of raw colors like `bg-white` or `text-gray-600`, so the whole site changes when a variable changes.

### UI Components

Ready-made components are in `src/components/ui/`. Use them before writing your own, and restyle them through the theme variables or their variants. Add more with `npx shadcn add <name>`. Show a toast by calling `toast()` from `sonner`; the container is already mounted in `__root.tsx`. `TooltipProvider` is mounted there too, so `Tooltip` works anywhere without its own provider.

| Need               | Components                                                         |
| ------------------ | ------------------------------------------------------------------ |
| Actions and status | Button, Badge, Progress, Skeleton, Alert, Sonner                   |
| Forms              | Input, Textarea, Label, Checkbox, RadioGroup, Switch, Select, Form |
| Overlays and menus | Dialog, Sheet, Popover, DropdownMenu, Tooltip                      |
| Content and layout | Card, Tabs, Accordion, Separator, Table                            |

Use `Form` with React Hook Form and the Zod resolver. Start from `src/examples/validated-form.tsx`; it isn't mounted or connected to a backend. Its required `onSubmit` callback must reject on failure. See [the form pattern](docs/forms.md) for HTTP submission and error handling.

Use Sheet for a mobile menu and DropdownMenu for short action lists. Give Dialog and Sheet an accessible title and description. Pair Checkbox, RadioGroup, Switch, and inputs with visible labels. Reserve tables for tabular data and wrap them in their provided scroll container.

### Design Choices

Set the product's palette, heading/body fonts, and layout before building its screens. Use an explicit user design when supplied; otherwise choose defaults that fit the product. Keep Basic's placeholder until you replace it with the requested product.

- Set `--font-body` and `--font-heading` in `src/styles.css`. Use `font-display` for headings when the product needs a separate heading font.
- Use `max-w-content` for a page container and `max-w-reading` for long text. Keep consistent horizontal padding, such as `px-4 sm:px-6`, and a small repeated spacing scale, such as `gap-4`, `gap-6`, and `py-12`.
- Keep one main heading per page and a clear heading order. Use muted text for supporting copy, not essential low-contrast labels.
- Preserve focus rings. Give icon-only buttons an accessible name. Ensure actions work with a keyboard and on narrow screens.
- Use short color/opacity transitions. Add `motion-reduce:transition-none` or `motion-reduce:animate-none` when adding motion; don't make essential content depend on animation.
- Provide loading, empty, error, and success states for each data-driven screen. Skeletons should follow the shape of the content they replace.

### Routing and Server Data

Router types are registered in `src/router.tsx`, so use typed `Link` destinations and route parameters. The root route supplies the themed 404 page; the router's default error component supplies the safe retry/home page, including child-route SSR failures. Use `throw notFound()` for absent records; keep unexpected failures on the error path. See [routing conventions](src/routes/README.md).

Start with route loaders and server functions for server data. Validate server-function input with `.validator(...)`, keep secrets on the server, and handle HTTP failures before returning data. See [the data-fetching pattern](docs/data-fetching.md). Add TanStack Query only when client-side caching, mutations, or background refresh are needed.

### Browser Storage

Pages are rendered on the server first, where `window` and `localStorage` don't exist. Read `localStorage` inside `useEffect`, not during render or in a `useState` initializer, or the first render will differ from the server HTML and React will log a hydration error.

## Configuration Files

| File             | Purpose                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `vite.config.ts` | Vite path aliases and Tailwind, Netlify, TanStack Start, React plugins                           |
| `tsconfig.json`  | Strict TypeScript, with the `@/*` alias for `src/*`                                              |
| `netlify.toml`   | Builds with `vite build`, publishes `dist/client`, dev server on port 8888 proxying Vite on 3000 |

## Development Commands

Use Node 22.13+ on the Node 22 line, Node 24, or Node 26+. The installed lint and test tools set this minimum alongside the framework.

```bash
npm run dev        # Start the Vite dev server on port 3000
npm run build      # Production build
npm run typecheck  # Type-check with tsc; the build doesn't
npm run lint       # Check TypeScript and React Hooks rules
npm run format:check # Check formatting
npm run format     # Format project files
npm test           # Run local form, control, and error page tests
npm run preview    # Preview the production build
```

## Conventions

- Components: PascalCase. Utilities and hooks: camelCase. Route files: kebab-case.
- Import from `src` with the `@/` alias.
- TypeScript fails on unused locals and parameters, so remove what you don't use.
- Use React hooks for state.
- Run the dev server or build once to generate route types before type-checking a fresh copy.
- Run build, typecheck, lint, format:check, and tests before reporting completion. Verify changed user flows locally; a passing build doesn't prove an interaction works.

## Application Name

Set the product's name and description in `src/routes/__root.tsx`:

- `siteName` is the page title and the title shown when the link is shared.
- `siteDescription` is the meta description and the description shown when the link is shared.

Then replace the placeholder heading and text in `src/routes/index.tsx`.
