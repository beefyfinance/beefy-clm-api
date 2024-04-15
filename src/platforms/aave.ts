import type { BalanceResult, IPlatform, IPlatformConstructor } from './types';
import type { Vault } from '../utils/vaults';
import { type Address, type GetBlockReturnType, type PublicClient } from 'viem';
import { getWantFromVault } from './helpers';
import type { ChainId } from '../config/chains';

class AavePlatform implements IPlatform {
  readonly id = 'aave';

  constructor(
    protected readonly chainId: ChainId,
    protected readonly publicClient: PublicClient,
    protected readonly block: GetBlockReturnType
  ) {}

  public async getBalances(vault: Vault, users: Address[]): Promise<BalanceResult> {
    const { wantAddress, wantTotalBalance, wantBalances } = await getWantFromVault(
      vault,
      users,
      this.block.number,
      this.publicClient
    );

    const userBalances = users.map((user, i) => {
      const userWantBalance = wantBalances[i]!;

      return {
        user,
        token: wantAddress,
        balance: userWantBalance,
      };
    });

    const vaultBalances = [{ token: wantAddress, balance: wantTotalBalance }];

    return {
      users: userBalances,
      vault: vaultBalances,
    };
  }
}

export const Aave = AavePlatform satisfies IPlatformConstructor<AavePlatform>;
