# TickLens — Synthetic Digit Analyzer

TickLens is a real-time analysis tool for Deriv synthetic markets. Pick a market, press **Start analysis**, and it loads the market's tick history and follows the live tick stream to show:

- Last-digit probability for every digit 0–9, with the most/least frequent digits and the current digit highlighted
- Even/Odd, Over/Under (any barrier 0–9) and Rise/Fall percentages, plus current streaks
- A next-digit prediction with its probability, the top alternatives, and the implied Even/Odd, Over/Under and Matches/Differs odds
- Live prediction accuracy compared with random baselines
- A recent digit stream and how many ticks ago each digit last appeared
- An **all synthetic markets** scanner that streams every market at once and ranks them by digit bias, prediction confidence, even/odd skew or over/under share

Data comes directly from the [Deriv WebSocket API](https://api.deriv.com) (`ticks_history` with `subscribe: 1`). Tick data is public, so only an app ID is required — no API token. The app ID can be changed from the **Connection** button in the header.

> Synthetic indices are driven by a random number generator. TickLens describes past ticks and gives statistical estimates; it does not guarantee outcomes.

## Tech stack

- TanStack Start + React 19, TypeScript
- Tailwind CSS 4 and shadcn/ui components
- Native browser WebSocket client for the Deriv API
- Deployed on Netlify

## Run locally

```bash
pnpm install
netlify dev   # or: pnpm dev
```

Then open the printed local URL. Tests for the statistics engine: `pnpm test`.
