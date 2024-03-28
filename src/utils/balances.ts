import type { PlatformId } from '../config/platforms.js';
import type { ChainId } from '../config/chains.js';
import type { Address } from 'viem';
import { defaultLogger } from './log.js';

export type UserProductBalance = {
  beefy_vault_id: string;
  beefy_vault_address: Address;
  want_address: Address;
  investor_address: Address;
  share_to_underlying_price: number;
  underlying_to_usd_price: number;
  share_token_balance: number;
  underlying_balance: number;
  usd_balance: number;
};

export async function fetchBalances(
  chainId: ChainId,
  platformId: PlatformId,
  blockNo: bigint,
  blockTimestamp: bigint
) {
  const params = new URLSearchParams({
    block_timestamp: blockTimestamp.toString(),
  });
  const url = `https://databarn.beefy.com/api/v1/points/${chainId}/${platformId}/balances_at/${blockNo}?${params}`;
  defaultLogger.info(url);
  const response = await fetch(url);
  const data = await response.json();
  if (!data || !Array.isArray(data) || data.length === 0 || !data[0].beefy_vault_id) {
    defaultLogger.trace(data);
    throw new Error(
      `Invalid response when fetching balances for chain ${chainId} and platform ${platformId} at block ${blockNo}`
    );
  }

  return data as UserProductBalance[];
}
