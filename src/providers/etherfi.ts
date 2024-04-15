import type { IProvider, IProviderConstructor, UserBalance, VaultBalance } from './types';
import type { ChainId } from '../config/chains';
import { type Address, type GetBlockReturnType, type PublicClient } from 'viem';
import type { Vault } from '../utils/vaults';
import { BaseProvider } from './base';
import type { PlatformBalance } from '../platforms/types';
import { getBuiltGraphSDK } from '../../.graphclient/index';
import type { TokenBreakdownBalancesQuery } from '../../.graphclient/index';

// const eETH: Address = '0x35fA164735182de50811E8e2E824cFb9B6118ac2';

const chainToWrapped: Partial<Record<ChainId, Address>> = {
  ethereum: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
  arbitrum: '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe',
};

class EtherFiProvider extends BaseProvider implements IProvider {
  private readonly wrapped: Address;
  private readonly graphCliSdk: any;

  constructor(
    chainId: ChainId,
    publicClient: PublicClient,
    block: GetBlockReturnType,
    vaults: Vault[],
    users: Address[],
    experimental: boolean
  ) {
    super('etherfi', ['weETH'], chainId, publicClient, block, vaults, users, experimental);

    const wrapped = chainToWrapped[chainId];
    if (!wrapped) {
      throw new Error(`${chainId} is not supported by ${this.id} provider`);
    }
    this.wrapped = wrapped;

    if (experimental) {
      this.graphCliSdk = getBuiltGraphSDK();
    }
  }

  protected get token(): Address {
    return this.wrapped;
  }

  protected filterPlatformBalance(balance: PlatformBalance): boolean {
    return balance.token === this.wrapped && balance.balance > 0;
  }

  protected override fetchAllBalances(
    users: `0x${string}`[]
  ): Promise<{ vaults: VaultBalance[]; users: UserBalance[] }> {
    if (!this.experimental) {
      return super.fetchAllBalances(users);
    }

    return this.graphCliSdk
      .TokenBreakdownBalances(
        {
          block_number: this.block.number.toString(),
          token_symbol: 'weETH',
        },
        { chainName: this.chainId }
      )
      .then((res: TokenBreakdownBalancesQuery) => {
        const balanceByInvestorAddress: { [addy: string]: bigint } = {};
        for (const token of res.tokens) {
          for (const breakdown of token.investorPositionBalanceBreakdowns) {
            const address = breakdown.investorPosition.investor.investor_address;
            const balance = BigInt(breakdown.effective_balance);
            if (balanceByInvestorAddress[address]) {
              balanceByInvestorAddress[address] += balance;
            } else {
              balanceByInvestorAddress[address] = balance;
            }
          }
        }

        const vaults: VaultBalance[] = [];
        const users: UserBalance[] = Object.entries(balanceByInvestorAddress).map(
          ([address, balance]) => {
            return {
              address: `0x${address}`,
              effective_balance: balance,
            };
          }
        );

        return { vaults, users };
      });
  }
}

export const EtherFi = EtherFiProvider satisfies IProviderConstructor<EtherFiProvider>;
