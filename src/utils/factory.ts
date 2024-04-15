import type { ChainId } from '../config/chains';

type FactoryFn<P, R> = (...props: P[]) => R;

export function createCachedFactory<P, R>(
  factoryFn: FactoryFn<P, R>,
  keyFn: (...args: P[]) => string = (...args: P[]) => JSON.stringify(args)
): FactoryFn<P, R> {
  const cache: { [index: string]: R } = {};
  return (...args: P[]): R => {
    const index = keyFn(...args);
    if (cache[index] === undefined) {
      cache[index] = factoryFn(...args);
    }
    return cache[index]!;
  };
}

export function createCachedFactoryByChainId<R>(
  factoryFn: FactoryFn<ChainId, R>
): FactoryFn<ChainId, R> {
  return createCachedFactory(factoryFn, (chainId: ChainId) => chainId);
}
