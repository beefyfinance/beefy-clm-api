import type { Chain as ViemChain, MulticallBatchOptions } from 'viem';
import { arbitrum, base, optimism, type Prettify } from 'viem/chains';
import { keyBy } from 'lodash';
import { keys } from '../utils/object';

export type Chain<T extends string = string> = {
  id: T;
  name: string;
  viem: ViemChain;
  batch?: boolean | MulticallBatchOptions | undefined;
  multicall?: boolean | Prettify<MulticallBatchOptions> | undefined;
  rpc: string;
};

function toChainMap<T extends ReadonlyArray<Chain>>(arr: T) {
  return keyBy(arr, 'id') as { [K in T[number]['id']]: Extract<T[number], { id: K }> };
}

export const chains = toChainMap([
  {
    id: 'arbitrum',
    name: 'Arbitrum',
    viem: arbitrum,
    rpc: 'http://localhost:8547',
  },
  {
    id: 'base',
    name: 'Base',
    viem: base,
    rpc: 'http://localhost:8547',
  },
  {
    id: 'optimism',
    name: 'Optimism',
    viem: optimism,
    rpc: 'http://localhost:8547',
  },
] as const satisfies ReadonlyArray<Chain>);

export type Chains = typeof chains;
export type ChainId = keyof Chains;

export const allChainIds = keys(chains);

export function getChain<T extends ChainId = ChainId>(id: T): Chain<T> {
  if (id in chains) {
    return chains[id];
  }
  throw new Error(`Unknown chain: ${id}`);
}

export function getChainOrUndefined<T extends ChainId = ChainId>(id: T): Chain<T> | undefined {
  if (id in chains) {
    return chains[id];
  }
  return undefined;
}
