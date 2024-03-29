import type { Address, GetBlockReturnType, PublicClient } from 'viem';
import type { ChainId } from '../config/chains.js';
import type { Vault } from '../utils/vaults.js';

export type TokenBalance = {
  token: Address;
  balance: bigint;
};

export type PlatformBalance = TokenBalance & {
  user: Address;
};

export type VaultPlatformBalance = TokenBalance;

export type BalanceResult = {
  users: PlatformBalance[];
  vault: VaultPlatformBalance[];
};

export interface IPlatform {
  readonly id: string;

  getBalances(vault: Vault, users: Address[]): Promise<BalanceResult>;
}

export interface IPlatformConstructor<T extends IPlatform = IPlatform> {
  new (chainId: ChainId, client: PublicClient, block: GetBlockReturnType): T;
}
