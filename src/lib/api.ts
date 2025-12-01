import { getGraphQLClient } from "./graphql-client";
import {
  GET_EXCHANGES,
  GET_ACCOUNTS,
  GET_ACCOUNT_BY_ID,
  CREATE_ACCOUNT,
  DELETE_ACCOUNT,
  Exchange,
  ExchangeAccount,
} from "./queries";
import { USE_MOCK_DATA, mockApi } from "./mock-data";

export const api = {
  async getExchanges(): Promise<Exchange[]> {
    if (USE_MOCK_DATA) {
      return mockApi.getExchanges();
    }

    const client = getGraphQLClient();
    const data = await client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES);
    return data.exchanges;
  },

  async getAccounts(): Promise<ExchangeAccount[]> {
    if (USE_MOCK_DATA) {
      return mockApi.getAccounts();
    }

    const client = getGraphQLClient();
    const data = await client.request<{ exchange_accounts: ExchangeAccount[] }>(
      GET_ACCOUNTS
    );
    return data.exchange_accounts;
  },

  async getAccountById(id: string): Promise<ExchangeAccount | null> {
    if (USE_MOCK_DATA) {
      return mockApi.getAccountById(id);
    }

    const client = getGraphQLClient();
    const data = await client.request<{
      exchange_accounts_by_pk: ExchangeAccount | null;
    }>(GET_ACCOUNT_BY_ID, { id });
    return data.exchange_accounts_by_pk;
  },

  async createAccount(input: {
    exchange_id: string;
    account_identifier: string;
    account_type: string;
    account_type_metadata: Record<string, unknown>;
  }): Promise<ExchangeAccount> {
    if (USE_MOCK_DATA) {
      return mockApi.createAccount(input);
    }

    const client = getGraphQLClient();
    const data = await client.request<{
      insert_exchange_accounts_one: ExchangeAccount;
    }>(CREATE_ACCOUNT, { input });
    return data.insert_exchange_accounts_one;
  },

  async deleteAccount(id: string): Promise<{ id: string }> {
    if (USE_MOCK_DATA) {
      return mockApi.deleteAccount(id);
    }

    const client = getGraphQLClient();
    const data = await client.request<{
      delete_exchange_accounts_by_pk: { id: string };
    }>(DELETE_ACCOUNT, { id });
    return data.delete_exchange_accounts_by_pk;
  },
};
