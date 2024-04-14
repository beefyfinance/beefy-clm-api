import type { BalancesResponse, UserBalance, VaultBalance } from './types.js';
import type { ChainId } from '../config/chains.js';
import { type Address, getAddress, type GetBlockReturnType, type PublicClient } from 'viem';
import type { Vault } from '../utils/vaults.js';
import { uniq } from 'lodash-es';
import { type PlatformId, platforms } from '../config/platforms.js';
import { fetchBalances } from '../utils/balances.js';
import type { ProviderId } from '../config/providers.js';
import type { TokenBalance } from '../platforms/types.js';

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
    protected readonly users: Address[],
    protected readonly experimental: boolean
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

  protected async fetchAllBalances(
    users: Address[]
  ): Promise<{ vaults: VaultBalance[]; users: UserBalance[] }> {
    const balancesPerVault = await Promise.all(this.vaults.map(v => this.fetchBalances(v, users)));
    const vaultsBalances = balancesPerVault.map((balances, i) => ({
      id: this.vaults[i].id,
      total: balances.vault,
    }));
    const balancesByUser = balancesPerVault
      .map(b => b.users)
      .flat()
      .reduce((acc, b) => {
        const user = b.address;
        const balance = acc.get(user) ?? 0n;
        acc.set(user, balance + b.effective_balance);
        return acc;
      }, new Map<Address, bigint>());

    const usersBalances = Array.from(balancesByUser.entries()).map(
      ([address, effective_balance]) => ({
        address,
        effective_balance,
      })
    );

    return { users: usersBalances, vaults: vaultsBalances };
  }

  protected async fetchBalances(
    vault: Vault,
    users: Address[]
  ): Promise<{ users: UserBalance[]; vault: bigint }> {
    const Platform = platforms[vault.platformId];
    const platform = new Platform(this.chainId, this.publicClient, this.block);
    const { users: userBalances, vault: vaultBalances } = await platform.getBalances(vault, users);
    return {
      users: userBalances
        .filter(this.filterPlatformBalance.bind(this))
        .map(b => ({ address: b.user, effective_balance: b.balance })),
      vault: vaultBalances.find(this.filterPlatformBalance.bind(this))?.balance ?? 0n,
    };
  }

  protected abstract get token(): Address;

  protected abstract filterPlatformBalance(
    balance: TokenBalance,
    index: number,
    all: TokenBalance[]
  ): boolean;

  public async getBalances(): Promise<BalancesResponse> {
    const userAddresses = await this.fetchUsers();
    const { users, vaults } = await this.fetchAllBalances(userAddresses);

    return {
      result: users,
      meta: {
        providerId: this.id,
        chainId: this.chainId,
        block: { number: this.block.number, timestamp: this.block.timestamp },
        token: this.token,
        vaults,
      },
    };
  }
}
