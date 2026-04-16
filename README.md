# Beat This Price

A Next.js App Router single-page app that checks trivago prices against a user's current best hotel deal.

## Stack

- Next.js 16 + TypeScript + App Router
- Tailwind CSS
- shadcn/ui (Card, Input, Button, Badge, Alert, Label, Select)
- Lucide icons

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

```bash
npm run lint
npm run test
npm run typecheck
npm run build
```

## API routes

- `POST /api/search-hotel`
  - body: `{ hotelName, destination }`
  - initializes MCP session and calls `trivago-search-suggestions`

- `POST /api/check-price`
  - body: `{ accommodationId, checkIn, checkOut, adults, currency }`
  - initializes MCP session and calls `trivago-accommodation-search`
  - returns best deal, deal URL, hotel details, and alternatives

## Deploy

This app is deploy-ready for Vercel (`npm run build` passes).
