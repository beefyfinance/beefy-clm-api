import type { Vault } from '../utils/vaults.js';
import { type Address, getContract, type PublicClient } from 'viem';
import { BeefyVaultAbi } from '../abi/BeefyVaultAbi.js';
import { defaultLogger } from '../utils/log.js';

export async function getWantFromVault(
  vault: Vault,
  users: Address[],
  blockNumber: bigint,
  publicClient: PublicClient
) {
  const callParams = { blockNumber };

  const beefyVault = getContract({
    client: publicClient,
    abi: BeefyVaultAbi,
    address: vault.earnContractAddress,
  });

  const [beefyTotalSupply, beefyWantBalance, wantAddress, ...shareBalances] = await Promise.all([
    beefyVault.read.totalSupply(callParams),
    beefyVault.read.balance(callParams),
    beefyVault.read.want(callParams),
    ...users.map(user => beefyVault.read.balanceOf([user], callParams)),
  ]);

  const wantBalances = shareBalances.map(
    shareBalance => (shareBalance * beefyWantBalance) / beefyTotalSupply
  );
  defaultLogger.debug({
    beefyTotalSupply,
    beefyWantBalance,
    shareBalances,
    wantAddress,
    wantBalances,
  });
  return { wantAddress, wantBalances };
}
