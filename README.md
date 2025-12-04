# zif-dashboard

Web dashboard for managing cryptocurrency exchange accounts across Hyperliquid, Lighter, and Drift.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev
```

Open http://localhost:3000

## Environment Variables

Create `.env.local` with:

```env
NEXT_PUBLIC_API_BASE_URL=http://167.99.145.4
NEXT_PUBLIC_GRAPHQL_ENDPOINT=/api/graphql
NEXT_PUBLIC_AUTH_ENDPOINT=/api/auth
NEXT_PUBLIC_USE_MOCK_API=false
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend server URL |
| `NEXT_PUBLIC_GRAPHQL_ENDPOINT` | GraphQL endpoint path |
| `NEXT_PUBLIC_AUTH_ENDPOINT` | Auth endpoint path |
| `NEXT_PUBLIC_USE_MOCK_API` | Set to `true` to use mock data |

## Mock API Mode

For development without backend access, enable mock mode:

```env
NEXT_PUBLIC_USE_MOCK_API=true
```

Restart the dev server after changing. Mock mode provides:
- 3 exchanges (Hyperliquid, Lighter, Drift)
- 3 sample accounts
- 5 sample trades
- Full CRUD operations (resets on restart)

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (dashboard)/        # Authenticated pages
│   │   ├── accounts/       # Account management
│   │   └── trades/         # Trade history
│   └── login/              # Login page
├── components/             # React components
│   └── ui/                 # shadcn/ui components
├── lib/
│   ├── api/                # API layer
│   │   ├── types.ts        # ApiClient interface
│   │   ├── graphql.ts      # GraphQL implementation
│   │   ├── mock.ts         # Mock implementation
│   │   └── index.ts        # Factory (switches based on env)
│   ├── queries.ts          # GraphQL queries and types
│   └── graphql-client.ts   # GraphQL client setup
└── hooks/                  # Custom React hooks
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **Data Fetching**: graphql-request
- **Auth**: Cookie-based tokens

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

---

## Backend API Reference

### Authentication

**POST** `/auth/login`
```json
{ "username": "admin", "password": "<password>" }
```
Returns: `{ "token": "...", "expires_at": "..." }`

**POST** `/auth/logout`
Header: `Authorization: Bearer <token>`

### GraphQL

**Endpoint**: `/v1/graphql`
Header: `Authorization: Bearer <token>`

**Tables**:
- `exchanges` - Supported exchanges
- `exchange_accounts` - User accounts on exchanges
- `trades` - Trade history

See backend documentation for full schema.
