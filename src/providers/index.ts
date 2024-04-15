import { type ProviderId, providers } from '../config/providers';
import type { ChainId } from '../config/chains';
import { getAddress, type GetBlockReturnType, type PublicClient } from 'viem';
import type { Vault } from '../utils/vaults';

export async function processProvider(
  providerId: ProviderId,
  chainId: ChainId,
  publicClient: PublicClient,
  block: GetBlockReturnType,
  vaults: Vault[],
  users: string[],
  experimental: boolean
) {
  const userAddresses = users.map(u => getAddress(u));
  const Provider = providers[providerId];
  const provider = new Provider(chainId, publicClient, block, vaults, userAddresses, experimental);
  return provider.getBalances();
}
