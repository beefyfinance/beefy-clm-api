import type { IPlatform, IPlatformConstructor, PlatformBalance } from './types.js';
import type { Vault } from '../utils/vaults.js';
import { type Address, type GetBlockReturnType, getContract, type PublicClient } from 'viem';
import { getWantFromVault } from './helpers.js';
import type { ChainId } from '../config/chains.js';
import { PendleMarketAbi } from '../abi/PendleMarketAbi.js';
import { PendleSyAbi } from '../abi/PendleSyAbi.js';

const chainToRouterAddress: Partial<Record<ChainId, Address>> = {
  ethereum: '0x00000000005BBB0EF59571E58418F9a4357b68A0',
  arbitrum: '0x00000000005BBB0EF59571E58418F9a4357b68A0',
  // optimism: '0x00000000005BBB0EF59571E58418F9a4357b68A0',
  // bsc: '0x00000000005BBB0EF59571E58418F9a4357b68A0',
};

class PendlePlatform implements IPlatform {
  readonly id = 'pendle';
  protected readonly routerAddress: Address;

  constructor(
    protected readonly chainId: ChainId,
    protected readonly publicClient: PublicClient,
    protected readonly block: GetBlockReturnType
  ) {
    const routerAddress = chainToRouterAddress[chainId];
    if (!routerAddress) {
      throw new Error(`${chainId} is not supported by ${this.id} platform`);
    }
    this.routerAddress = routerAddress;
  }

  public async getBalances(vault: Vault, users: Address[]): Promise<PlatformBalance[]> {
    const callParams = { blockNumber: this.block.number };
    const { wantAddress: pendleMarketAddress, wantBalances } = await getWantFromVault(
      vault,
      users,
      this.block.number,
      this.publicClient
    );

    const pendleMarket = getContract({
      client: this.publicClient,
      abi: PendleMarketAbi,
      address: pendleMarketAddress,
    });

    const [pendleTokens, pendleState] = await Promise.all([
      pendleMarket.read.readTokens(callParams),
      pendleMarket.read.readState([this.routerAddress], callParams),
    ]);

    const [syAddress, _ptAddress] = pendleTokens;
    const { totalSy, totalLp: pendleTotalSupply } = pendleState;

    const syToken = getContract({
      client: this.publicClient,
      abi: PendleSyAbi,
      address: syAddress,
    });

    const [syUnderlyingAddress] = await Promise.all([syToken.read.yieldToken(callParams)]);

    return users.map((user, i) => {
      const userWantBalance = wantBalances[i]!;

      return {
        user,
        token: syUnderlyingAddress,
        balance: (totalSy * userWantBalance) / pendleTotalSupply,
      };
    });
  }
}

export const Pendle = PendlePlatform satisfies IPlatformConstructor<PendlePlatform>;
