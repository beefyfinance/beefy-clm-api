import type { PlatformId } from '../config/platforms';
import type { ChainId } from '../config/chains';
import type { Address } from 'viem';
import { defaultLogger } from './log';
import { DatabarnEmptyResponseError, DatabarnInvalidResponseError } from './error';

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
  if (!data || !Array.isArray(data)) {
    defaultLogger.trace(data);
    throw new DatabarnInvalidResponseError(chainId, platformId, blockNo);
  }
  if (data.length === 0) {
    defaultLogger.trace(data);
    throw new DatabarnEmptyResponseError(chainId, platformId, blockNo);
  }
  if (!data[0].beefy_vault_id) {
    defaultLogger.trace(data);
    throw new DatabarnInvalidResponseError(chainId, platformId, blockNo);
  }

  return data as UserProductBalance[];
}
