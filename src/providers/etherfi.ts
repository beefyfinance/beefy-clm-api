import type { BalancesResponse, IProvider, IProviderConstructor, UserBalance } from './types.js';
import type { ChainId } from '../config/chains.js';
import { type Address, getAddress, type GetBlockReturnType, type PublicClient } from 'viem';
import type { Vault } from '../utils/vaults.js';
import { uniq } from 'lodash-es';
import { type PlatformId, platforms } from '../config/platforms.js';
import { fetchBalances } from '../utils/balances.js';

const supportedAssets = ['weETH'] as const;

// const eETH: Address = '0x35fA164735182de50811E8e2E824cFb9B6118ac2';

const chainToWrapped: Partial<Record<ChainId, Address>> = {
  ethereum: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
  arbitrum: '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe',
};

class EtherFiProvider implements IProvider {
  readonly id = 'etherfi';
  private readonly vaults: Vault[];
  private readonly platforms: PlatformId[];
  private readonly wrapped: Address;

  constructor(
    protected readonly chainId: ChainId,
    protected readonly publicClient: PublicClient,
    protected readonly block: GetBlockReturnType,
    vaults: Vault[],
    protected readonly users: Address[]
  ) {
    const wrapped = chainToWrapped[chainId];
    if (!wrapped) {
      throw new Error(`${chainId} is not supported by ${this.id} provider`);
    }

    this.vaults = vaults.filter(v => supportedAssets.some(a => v.assets.includes(a)));
    this.platforms = uniq(this.vaults.map(v => v.platformId));
    this.wrapped = wrapped;
  }

  protected async fetchUsers() {
    if (this.users.length > 0) {
      return this.users;
    }

    const balances = (
      await Promise.all(
        this.platforms.map(p =>
          fetchBalances(this.chainId, p, this.block.number, this.block.timestamp)
        )
      )
    ).flat();
    return uniq(balances.map(b => getAddress(b.investor_address)));
  }

  protected async fetchAllBalances(users: Address[]): Promise<UserBalance[]> {
    const balances = (await Promise.all(this.vaults.map(v => this.fetchBalances(v, users)))).flat();
    const balancesByUser = balances.reduce((acc, b) => {
      const user = b.address;
      const balance = acc.get(user) ?? 0n;
      acc.set(user, balance + b.effective_balance);
      return acc;
    }, new Map<Address, bigint>());

    return Array.from(balancesByUser.entries()).map(([address, effective_balance]) => ({
      address,
      effective_balance,
    }));
  }

  protected async fetchBalances(vault: Vault, users: Address[]): Promise<UserBalance[]> {
    const Platform = platforms[vault.platformId];
    const platform = new Platform(this.chainId, this.publicClient, this.block);
    const balances = await platform.getBalances(vault, users);
    return balances
      .filter(b => b.token === this.wrapped && b.balance > 0)
      .map(b => ({ address: b.user, effective_balance: b.balance }));
  }

  public async getBalances(): Promise<BalancesResponse> {
    const users = await this.fetchUsers();
    const balances = await this.fetchAllBalances(users);

    return {
      result: balances,
      meta: {
        providerId: this.id,
        chainId: this.chainId,
        block: { number: this.block.number, timestamp: this.block.timestamp },
        token: this.wrapped,
        vaults: this.vaults.map(v => v.id),
      },
    };
  }
}

export const EtherFi = EtherFiProvider satisfies IProviderConstructor<EtherFiProvider>;
