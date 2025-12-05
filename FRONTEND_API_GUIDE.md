# Frontend API Guide

This guide provides everything frontend developers need to know about the APIs available for building frontend applications.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Hasura Built-in Features](#hasura-built-in-features)
3. [Authentication API](#authentication-api)
4. [GraphQL API](#graphql-api)
5. [Complete API Reference](#complete-api-reference)

---

## Quick Start

### Base URLs

**Development/Test Server:**
- Base URL: `http://167.99.145.4`
- GraphQL Endpoint: `http://167.99.145.4/v1/graphql`
- Auth Endpoint: `http://167.99.145.4/auth`

**Local Development:**
- GraphQL Endpoint: `http://localhost:8080/v1/graphql`
- Auth Endpoint: `http://localhost:8081/auth`

### Authentication Flow

1. **Login** to get a token:
   ```bash
   curl -X POST http://167.99.145.4/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"your_password"}'
   ```
   Response: `{"token":"...","expires_at":"..."}`

2. **Use token** in GraphQL requests:
   ```bash
   curl -X POST http://167.99.145.4/v1/graphql \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"query":"{ exchanges { id name } }"}'
   ```

---

## Hasura Built-in Features

### GraphQL Schema Introspection

Query the schema itself to discover available types, fields, and operations:

```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query IntrospectSchema { __schema { types { name description fields { name type { name } } } } }"
  }'
```

### Query Available Types

```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query { __type(name: \"exchange_accounts\") { name fields { name type { name } } } }"
  }'
```

### Auto-generated API Documentation

Hasura automatically generates GraphQL API documentation from your database schema:
- All tables become queryable types
- Relationships become nested fields
- Permissions determine what's accessible
- Types are inferred from PostgreSQL schema

**Discover Schema via CLI:**
```bash
# Get all query types
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query { __schema { queryType { fields { name description args { name type { name } } } } } }"
  }'

# Get all mutation types
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query { __schema { mutationType { fields { name description args { name type { name } } } } } }"
  }'
```

---

## Authentication API

### Base URL
`http://167.99.145.4/auth`

### POST `/auth/login`

Authenticate and receive a session token.

**Request:**
```bash
curl -X POST http://167.99.145.4/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'
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

### POST `/auth/logout`

Invalidate a session token.

**Request:**
```bash
curl -X POST http://167.99.145.4/auth/logout \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

### GET `/health`

Health check endpoint.

**Request:**
```bash
curl http://167.99.145.4/health
```

**Response (200 OK):**
```json
{
  "status": "healthy"
}
```

---

## GraphQL API

### Endpoint
`http://167.99.145.4/v1/graphql`

### Authentication

All GraphQL requests require authentication via the `Authorization` header:

```
Authorization: Bearer <token>
```

**Example:**
```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "{ exchanges { id name } }"
  }'
```

---

## Complete API Reference

### Available Tables

#### 1. `exchanges`

Supported cryptocurrency exchanges (Hyperliquid, Lighter, Drift).

**Fields:**
- `id` (UUID) - Primary key
- `name` (String) - Internal identifier: "hyperliquid", "lighter", "drift"
- `display_name` (String) - User-friendly name: "Hyperliquid", "Lighter", "Drift"

**Relationships:**
- `exchange_accounts` (Array) - All accounts for this exchange

**Query Example:**
```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query GetExchanges { exchanges { id name display_name exchange_accounts { id account_identifier } } }"
  }'
```

#### 2. `exchange_account_types`

Account type lookup table.

**Fields:**
- `code` (String) - Account type code: "main", "sub_account", "vault"

**Relationships:**
- `exchange_accounts` (Array) - All accounts of this type

**Query Example:**
```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query GetAccountTypes { exchange_account_types { code exchange_accounts { id account_identifier } } }"
  }'
```

#### 3. `exchange_accounts`

User accounts on exchanges.

**Fields:**
- `id` (UUID) - Primary key
- `exchange_id` (UUID) - Foreign key to exchanges
- `account_identifier` (String) - Exchange-specific identifier (address/index)
- `account_type` (String) - Type: "main", "sub_account", or "vault"
- `account_type_metadata` (JSON) - Additional account-specific data

**Relationships:**
- `exchange` (Object) - The exchange this account belongs to
- `account_type_by_account_type` (Object) - Account type details
- `trades` (Array) - All trades for this account

**Query Example (All Accounts):**
```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query GetAccounts { exchange_accounts { id account_identifier account_type account_type_metadata exchange { id name display_name } account_type_by_account_type { code } trades { id base_asset quote_asset side price quantity timestamp } } }"
  }'
```

**Query Example (Single Account):**
```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query GetAccountById($id: uuid!) { exchange_accounts_by_pk(id: $id) { id account_identifier account_type exchange { name display_name } trades { id timestamp price quantity } } }",
    "variables": { "id": "uuid-here" }
  }'
```

#### 4. `trades`

Trade history records.

**Fields:**
- `id` (UUID) - Primary key
- `base_asset` (String) - Base asset symbol (e.g., "BTC")
- `quote_asset` (String) - Quote asset symbol (e.g., "USDC")
- `side` (String) - "buy" or "sell"
- `price` (Decimal) - Trade price
- `quantity` (Decimal) - Trade quantity
- `timestamp` (Timestamp) - Trade timestamp
- `fee` (Decimal) - Trade fee
- `order_id` (String) - Exchange order ID
- `trade_id` (String) - Exchange trade ID
- `exchange_account_id` (UUID) - Foreign key to exchange_accounts
- `created_at` (Timestamp) - Record creation timestamp

**Relationships:**
- `exchange_account` (Object) - The account this trade belongs to

**Query Example:**
```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query GetTrades($accountId: uuid!) { trades(where: { exchange_account_id: { _eq: $accountId } }) { id base_asset quote_asset side price quantity timestamp fee exchange_account { account_identifier exchange { display_name } } } }",
    "variables": { "accountId": "uuid-here" }
  }'
```

**Query Example (Filtered):**
```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query GetTradesFiltered($accountId: uuid!, $from: timestamptz!) { trades(where: { exchange_account_id: { _eq: $accountId } timestamp: { _gte: $from } } order_by: { timestamp: desc } limit: 100) { id base_asset side price quantity timestamp } }",
    "variables": {
      "accountId": "uuid-here",
      "from": "2024-01-01T00:00:00Z"
    }
  }'
```

### Mutations

#### Create Exchange Account

```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "mutation CreateAccount($input: exchange_accounts_insert_input!) { insert_exchange_accounts_one(object: $input) { id account_identifier account_type exchange { name display_name } } }",
    "variables": {
      "input": {
        "exchange_id": "uuid-here",
        "account_identifier": "0x123...",
        "account_type": "main",
        "account_type_metadata": {
          "address": "0x123...",
          "index": 0
        }
      }
    }
  }'
```

#### Update Exchange Account

```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "mutation UpdateAccount($id: uuid!, $input: exchange_accounts_set_input!) { update_exchange_accounts_by_pk(pk_columns: { id: $id }, _set: $input) { id account_identifier account_type account_type_metadata } }",
    "variables": {
      "id": "uuid-here",
      "input": {
        "account_identifier": "0x456...",
        "account_type_metadata": {
          "updated_field": "value"
        }
      }
    }
  }'
```

#### Delete Exchange Account

```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "mutation DeleteAccount($id: uuid!) { delete_exchange_accounts_by_pk(id: $id) { id } }",
    "variables": {
      "id": "uuid-here"
    }
  }'
```

### Query Filters

Hasura supports powerful filtering using PostgreSQL operators:

**Comparison Operators:**
- `_eq` - Equal
- `_neq` - Not equal
- `_gt` - Greater than
- `_gte` - Greater than or equal
- `_lt` - Less than
- `_lte` - Less than or equal
- `_in` - In array
- `_nin` - Not in array
- `_is_null` - Is null

**String Operators:**
- `_like` - Pattern matching (case-sensitive)
- `_ilike` - Pattern matching (case-insensitive)
- `_similar` - Regular expression matching

**Example:**
```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query FilteredAccounts { exchange_accounts(where: { account_type: { _eq: \"main\" } exchange: { name: { _in: [\"hyperliquid\", \"lighter\"] } } account_identifier: { _like: \"0x%\" } }) { id account_identifier exchange { display_name } } }"
  }'
```

### Sorting

```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query SortedTrades { trades(order_by: [{ timestamp: desc }, { price: asc }] limit: 50) { id timestamp price } }"
  }'
```

### Pagination

```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query PaginatedTrades($limit: Int!, $offset: Int!) { trades(limit: $limit offset: $offset order_by: { timestamp: desc }) { id timestamp } trades_aggregate { aggregate { count } } }",
    "variables": {
      "limit": 50,
      "offset": 0
    }
  }'
```

### Aggregations

```bash
curl -X POST http://167.99.145.4/v1/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "query TradeStats($accountId: uuid!) { trades_aggregate(where: { exchange_account_id: { _eq: $accountId } }) { aggregate { count sum { quantity fee } avg { price } max { price timestamp } min { price timestamp } } } }",
    "variables": {
      "accountId": "uuid-here"
    }
  }'
```

---

## Health Checks

Verify backend connectivity:

- **Hasura Health**: `http://167.99.145.4/healthz` (returns `OK`)
- **Auth Service Health**: `http://167.99.145.4/health` (returns `{"status":"healthy"}`)

**Test Commands:**
```bash
# Hasura health check
curl http://167.99.145.4/healthz

# Auth service health check
curl http://167.99.145.4/health
```

---

## Getting Help

1. **Use Schema Introspection** - Query `__schema` to discover available types programmatically
2. **Review Example Queries** - See `web-dashboard/src/lib/queries.ts` for real examples
3. **Check Permissions** - Ensure your role has access to the fields you're querying

---

**Last Updated:** December 2024
