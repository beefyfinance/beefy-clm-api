import type { IPlatform, IPlatformConstructor, PlatformBalance } from './types.js';
import type { Vault } from '../utils/vaults.js';
import { type Address, type GetBlockReturnType, type PublicClient } from 'viem';
import { getWantFromVault } from './helpers.js';
import type { ChainId } from '../config/chains.js';

class AavePlatform implements IPlatform {
  readonly id = 'aave';

  constructor(
    protected readonly chainId: ChainId,
    protected readonly publicClient: PublicClient,
    protected readonly block: GetBlockReturnType
  ) {}

  public async getBalances(vault: Vault, users: Address[]): Promise<PlatformBalance[]> {
    const { wantAddress, wantBalances } = await getWantFromVault(
      vault,
      users,
      this.block.number,
      this.publicClient
    );

    return users.map((user, i) => {
      const userWantBalance = wantBalances[i]!;

      return {
        user,
        token: wantAddress,
        balance: userWantBalance,
      };
    });
  }
}

export const Aave = AavePlatform satisfies IPlatformConstructor<AavePlatform>;
