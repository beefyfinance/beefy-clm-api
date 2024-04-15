import type { BalanceResult, IPlatform, IPlatformConstructor } from './types';
import type { Vault } from '../utils/vaults';
import type { Address } from 'viem';
import { defaultLogger } from '../utils/log';

class CurvePlatform implements IPlatform {
  readonly id = 'curve';

  public async getBalances(_vault: Vault, _users: Address[]): Promise<BalanceResult> {
    // TODO
    defaultLogger.debug('curve not implemented');
    return { users: [], vault: [] };
  }
}

export const Curve = CurvePlatform satisfies IPlatformConstructor<CurvePlatform>;
