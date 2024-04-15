import type { IProvider, IProviderConstructor } from './types';
import type { ChainId } from '../config/chains';
import { type Address, type GetBlockReturnType, type PublicClient } from 'viem';
import type { Vault } from '../utils/vaults';
import { BaseProvider } from './base';
import type { PlatformBalance } from '../platforms/types';

const chainToToken: Partial<Record<ChainId, Address>> = {
  ethereum: '0xbf5495Efe5DB9ce00f80364C8B423567e58d2110',
  arbitrum: '0x2416092f143378750bb29b79eD961ab195CcEea5',
  linea: '0x2416092f143378750bb29b79eD961ab195CcEea5',
};

class RenzoProvider extends BaseProvider implements IProvider {
  private readonly ezETH: Address;

  constructor(
    chainId: ChainId,
    publicClient: PublicClient,
    block: GetBlockReturnType,
    vaults: Vault[],
    users: Address[]
  ) {
    super('renzo', ['ezETH'], chainId, publicClient, block, vaults, users);

    const token = chainToToken[chainId];
    if (!token) {
      throw new Error(`${chainId} is not supported by ${this.id} provider`);
    }
    this.ezETH = token;
  }

  protected get token(): Address {
    return this.ezETH;
  }

  protected filterPlatformBalance(balance: PlatformBalance): boolean {
    return balance.token === this.ezETH && balance.balance > 0;
  }
}

export const Renzo = RenzoProvider satisfies IProviderConstructor<RenzoProvider>;
