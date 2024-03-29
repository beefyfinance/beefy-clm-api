import type { BalancesResponse, UserBalance } from './types.js';
import type { ChainId } from '../config/chains.js';
import { type Address, getAddress, type GetBlockReturnType, type PublicClient } from 'viem';
import type { Vault } from '../utils/vaults.js';
import { uniq } from 'lodash-es';
import { type PlatformId, platforms } from '../config/platforms.js';
import { fetchBalances } from '../utils/balances.js';
import type { ProviderId } from '../config/providers.js';
import type { PlatformBalance } from '../platforms/types.js';

export abstract class BaseProvider {
  protected readonly vaults: Vault[];
  protected readonly platforms: PlatformId[];

  constructor(
    public readonly id: ProviderId,
    protected readonly supportedAssets: string[],
    protected readonly chainId: ChainId,
    protected readonly publicClient: PublicClient,
    protected readonly block: GetBlockReturnType,
    vaults: Vault[],
    protected readonly users: Address[]
  ) {
    this.vaults = vaults.filter(v => supportedAssets.some(a => v.assets.includes(a)));
    if (vaults.length === 0) {
      throw new Error(`No vaults with supported assets found for ${this.id} provider`);
    }
    this.platforms = uniq(this.vaults.map(v => v.platformId));
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
      .filter(this.filterPlatformBalance.bind(this))
      .map(b => ({ address: b.user, effective_balance: b.balance }));
  }

  protected abstract get token(): Address;

  protected abstract filterPlatformBalance(
    balance: PlatformBalance,
    index: number,
    all: PlatformBalance[]
  ): boolean;

  public async getBalances(): Promise<BalancesResponse> {
    const users = await this.fetchUsers();
    const balances = await this.fetchAllBalances(users);

    return {
      result: balances,
      meta: {
        providerId: this.id,
        chainId: this.chainId,
        block: { number: this.block.number, timestamp: this.block.timestamp },
        token: this.token,
        vaults: this.vaults.map(v => v.id),
      },
    };
  }
}
