import type { IPlatform, IPlatformConstructor, PlatformBalance } from './types.js';
import type { Vault } from '../utils/vaults.js';
import type { Address } from 'viem';
import { defaultLogger } from '../utils/log.js';

class CurvePlatform implements IPlatform {
  readonly id = 'curve';

  public async getBalances(_vault: Vault, _users: Address[]): Promise<PlatformBalance[]> {
    // TODO
    defaultLogger.debug('curve not implemented');
    return [];
  }
}

export const Curve = CurvePlatform satisfies IPlatformConstructor<CurvePlatform>;
