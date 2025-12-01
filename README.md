# `zif-dashboard` - Web Dashboard

## Purpose & Overview

The `zif-dashboard` is a web application that provides a user interface for managing cryptocurrency exchange accounts and viewing aggregated data across multiple exchanges (Hyperliquid, Lighter, Drift).

**Key Features:**
- Add and manage exchange accounts
- View live positions across all connected accounts
- View trade history and funding history
- View analytics including PnL, fees paid, funding received, and performance metrics

The dashboard connects to a backend infrastructure that aggregates data from multiple exchanges and stores it in a centralized database, allowing users to view all their exchange activity in one place.

---

## Backend Details

### Backend Server

The development backend is hosted on a DigitalOcean droplet:

- **Server**: `zif-test-db`
- **Base URL**: `http://167.99.145.4`
- **Access**: Services are exposed via nginx reverse proxy

### Available Services

1. **Hasura GraphQL Engine** - GraphQL API for database operations
2. **Auth Service** - Authentication and authorization

All services are accessible through the nginx reverse proxy at the base URL above.

---

## APIs Available

### Authentication API

**Base URL**: `http://167.99.145.4/auth`

#### POST `/auth/login`

Authenticate and receive a session token.

**Request:**
```json
{
  "username": "admin",
  "password": "<password>"
}
```

**Response (200 OK):**
```json
{
  "token": "abc-123-def-456",
  "expires_at": "2024-12-02T12:00:00Z"
}
```

**Response (401 Unauthorized):**
```
Invalid credentials
```

#### POST `/auth/logout`

Invalidate a session token.

**Request Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

### GraphQL API

**Endpoint**: `http://167.99.145.4/v1/graphql`

All GraphQL requests require authentication via the `Authorization` header:
```
Authorization: Bearer <token>
```

#### Available Tables

- **`exchanges`** - Supported exchanges (Hyperliquid, Lighter, Drift)
  - Fields: `id`, `name`, `display_name`
  
- **`exchange_accounts`** - User accounts on exchanges
  - Fields: `id`, `exchange_id`, `account_identifier`, `account_type`, `account_type_metadata`
  - Relationships: `exchange` (object), `exchange_accounts` (array from exchanges)

#### Example Query

```graphql
query GetExchanges {
  exchanges {
    id
    name
    display_name
  }
}

query GetAccounts {
  exchange_accounts {
    id
    account_identifier
    account_type
    exchange {
      name
      display_name
    }
  }
}
```

#### Example Mutation

```graphql
mutation CreateAccount($input: exchange_accounts_insert_input!) {
  insert_exchange_accounts_one(object: $input) {
    id
    account_identifier
  }
}
```

**Variables:**
```json
{
  "input": {
    "exchange_id": "<exchange-uuid>",
    "account_identifier": "0x123...",
    "account_type": "main",
    "account_type_metadata": {}
  }
}
```

---

## Backend Credentials

Credentials for accessing the development backend will be provided separately. You will need:

- **Admin Username**: For authentication service login
- **Admin Password**: For authentication service login

**Note**: Never commit credentials to the repository. Use environment variables for configuration.

---

## Health Checks

You can verify backend connectivity using these endpoints:

- **Hasura Health**: `http://167.99.145.4/healthz` (returns `OK`)
- **Auth Service Health**: `http://167.99.145.4/health` (returns `{"status":"healthy"}`)
