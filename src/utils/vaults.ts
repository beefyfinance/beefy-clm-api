import { type ChainId } from '../config/chains';
import { Cache } from './cache';
import { defaultLogger } from './log';
import { isSupportedPlatform, type PlatformId } from '../config/platforms';
import { type Address } from 'viem';

export type RawVault = {
  id: string;
  name: string;
  earnContractAddress: string;
  tokenAddress?: string;
  tokenDecimals: number;
  assets?: string[];
  platformId: string;
  earningPoints: boolean;
};

export type Vault = {
  id: string;
  name: string;
  earnContractAddress: Address;
  tokenAddress: Address;
  tokenDecimals: number;
  assets: string[];
  platformId: PlatformId;
  earningPoints: true;
};

async function fetchVaults(chainId: ChainId): Promise<RawVault[]> {
  const url = `https://api.beefy.finance/vaults/${chainId}`;
  const response = await fetch(url);
  const data = await response.json();
  defaultLogger.info(url);
  if (!data || !Array.isArray(data) || data.length === 0 || !data[0].id) {
    defaultLogger.trace(data);
    throw new Error(`Invalid response when fetching vaults for chain ${chainId}`);
  }
  return data as RawVault[];
}

const cache = new Cache<Vault[]>();
const promises = new Map<ChainId, Promise<Vault[]>>();

function isPointsVault(v: RawVault): v is Vault {
  return (
    v.earningPoints &&
    v.tokenAddress !== undefined &&
    v.assets !== undefined &&
    v.assets.length > 0 &&
    isSupportedPlatform(v.platformId)
  );
}

async function fetchAndCacheVaults(chainId: ChainId): Promise<Vault[]> {
  const vaults = (await fetchVaults(chainId)).filter(isPointsVault);
  cache.set(chainId, vaults, 1000 * 60 * 60);
  return vaults;
}

export async function getVaults(chainId: ChainId): Promise<Vault[]> {
  const pending = promises.get(chainId);
  if (pending) {
    return pending;
  }

  const cached = cache.get(chainId);
  // fetch if not cached or cache expired
  if (!cached || cached.expired) {
    const promise = fetchAndCacheVaults(chainId);
    promises.set(chainId, promise);
    // if not cached we have to wait for the fetch to complete
    if (!cached) {
      return promise;
    }
  }

  // return cached value even if expired
  return cached.value;
}
