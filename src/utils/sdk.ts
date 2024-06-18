import { ChainId, allChainIds } from '../config/chains';
import { GraphQLClient } from 'graphql-request';
import { Sdk, getSdk } from '../queries/codegen/sdk';
import { createCachedFactoryByChainId } from './factory';
import { GraphQueryError } from './error';
import { getLoggerFor } from './log';

const logger = getLoggerFor('sdk');

// adds the chainId to the response on all sdk queries
type EndpointSdk = {
  [key in keyof Sdk]: (
    ...args: Parameters<Sdk[key]>
  ) => Promise<Awaited<ReturnType<Sdk[key]>> & { chain: ChainId }>;
};

export const getAllSdks = () => allChainIds.flatMap(chain => getSdksForChain(chain));

export const getSdksForChain = createCachedFactoryByChainId((chain: ChainId): EndpointSdk[] => {
  const clients = [
    new GraphQLClient(
      `https://api.goldsky.com/api/public/project_clu2walwem1qm01w40v3yhw1f/subgraphs/beefy-clm-${chain}/latest/gn`
    ),
  ];

  if (chain === 'arbitrum') {
    clients.push(
      new GraphQLClient(
        `https://api.goldsky.com/api/public/project_clu2walwem1qm01w40v3yhw1f/subgraphs/beefy-clm-${chain}-beta/latest/gn`
      )
    );
  }

  return clients
    .map(client => getSdk(client))
    .map(sdk => {
      return new Proxy(sdk, {
        get:
          (target, prop) =>
          async (...args: any) => {
            // @ts-ignore
            const res = await target[prop](...args).catch((e: unknown) => {
              throw new GraphQueryError(e);
            });
            return { ...res, chain };
          },
      }) as EndpointSdk;
    });
});

export async function paginateSdkCalls<R>(
  sdk: EndpointSdk,
  fn: (sdk: Sdk, skip: number, first: number) => Promise<R>,
  count: (res: R) => number,
  options: { pageSize: number; fetchAtMost: number }
): Promise<R[]> {
  const { pageSize, fetchAtMost } = options;
  const results: R[] = [];
  let skip = 0;
  let fetched = 0;

  while (fetched < fetchAtMost) {
    const res = await fn(sdk, skip, pageSize);
    results.push(res);
    let resCount = count(res);
    logger.debug(`Fetched ${resCount} results, total fetched: ${fetched}`);
    if (resCount < pageSize) {
      break;
    }
    fetched += resCount;
    skip += pageSize;
  }

  return results;
}
