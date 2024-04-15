import type { IProvider, IProviderConstructor } from './types';
import type { ChainId } from '../config/chains';
import { type Address, type GetBlockReturnType, type PublicClient } from 'viem';
import type { Vault } from '../utils/vaults';
import { BaseProvider } from './base';
import type { PlatformBalance } from '../platforms/types';

// const eETH: Address = '0x35fA164735182de50811E8e2E824cFb9B6118ac2';

const chainToWrapped: Partial<Record<ChainId, Address>> = {
  ethereum: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
  arbitrum: '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe',
};

class EtherFiProvider extends BaseProvider implements IProvider {
  private readonly wrapped: Address;

  constructor(
    chainId: ChainId,
    publicClient: PublicClient,
    block: GetBlockReturnType,
    vaults: Vault[],
    users: Address[]
  ) {
    super('etherfi', ['weETH'], chainId, publicClient, block, vaults, users);

    const wrapped = chainToWrapped[chainId];
    if (!wrapped) {
      throw new Error(`${chainId} is not supported by ${this.id} provider`);
    }
    this.wrapped = wrapped;
  }

  protected get token(): Address {
    return this.wrapped;
  }

  protected filterPlatformBalance(balance: PlatformBalance): boolean {
    return balance.token === this.wrapped && balance.balance > 0;
  }
}

export const EtherFi = EtherFiProvider satisfies IProviderConstructor<EtherFiProvider>;
