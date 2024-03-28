import type { Address, GetBlockReturnType, PublicClient } from 'viem';
import type { ChainId } from '../config/chains.js';
import type { Vault } from '../utils/vaults.js';

export type PlatformBalance = {
  user: Address;
  token: Address;
  balance: bigint;
};

export interface IPlatform {
  readonly id: string;

  getBalances(vault: Vault, users: Address[]): Promise<PlatformBalance[]>;
}

export interface IPlatformConstructor<T extends IPlatform = IPlatform> {
  new (chainId: ChainId, client: PublicClient, block: GetBlockReturnType): T;
}
