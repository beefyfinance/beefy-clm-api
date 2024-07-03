import { type Static, Type } from '@sinclair/typebox';
import { GraphQLClient } from 'graphql-request';
import { isArray } from 'lodash';
import { type ChainId, allChainIds, chainIdSchema } from '../config/chains';
import { SUBGRAPH_TAG } from '../config/env';
import { type Sdk, getSdk } from '../queries/codegen/sdk';
import { withTimeout } from './async';
import { GraphQueryError } from './error';
import { createCachedFactoryByChainId } from './factory';
import { getLoggerFor } from './log';

const logger = getLoggerFor('sdk');

// adds the context to the response on all sdk queries
export const sdkContextSchema = Type.Object({
  chain: chainIdSchema,
  subgraph: Type.String(),
  tag: Type.String(),
});
export type SdkContext = Static<typeof sdkContextSchema>;

type EndpointSdk = {
  [key in keyof Sdk]: (
    ...args: Parameters<Sdk[key]>
  ) => Promise<Awaited<ReturnType<Sdk[key]>> & SdkContext>;
};

const getAllSdks = () => allChainIds.flatMap(chain => getSdksForChain(chain));

export const getSdksForChain = createCachedFactoryByChainId((chain: ChainId): EndpointSdk[] => {
  const configs = [getSubgraphConfig(chain, SUBGRAPH_TAG)];
  if (chain === 'arbitrum') {
    configs.push(getSubgraphConfig(chain, SUBGRAPH_TAG, true));
  }

  return configs
    .map(builder => builder())
    .map(({ sdk, ...context }: SdkWithContext) => {
      return new Proxy(sdk, {
        get:
          (target, prop) =>
          async (...args: unknown[]) => {
            // @ts-ignore
            const res = await target[prop](...args).catch((e: unknown) => {
              throw new GraphQueryError(e, context);
            });
            return { ...res, ...context };
          },
      }) as EndpointSdk;
    });
});

type SdkWithContext = SdkContext & { sdk: Sdk };
type SdkConfig = () => SdkWithContext;

function getSubgraphConfig(chain: ChainId, tag: string, isBeta = false): SdkConfig {
  const subgraph = getSubgraphName(chain, isBeta);
  return () => ({
    chain,
    subgraph,
    tag,
    sdk: getSdk(new GraphQLClient(getSubgraphUrl(subgraph, tag))),
  });
}

function getSubgraphName(chain: ChainId, isBeta = false): string {
  return `beefy-clm-${chain}${isBeta ? '-beta' : ''}`;
}

function getSubgraphUrl(name: string, tag: string): string {
  return `https://api.goldsky.com/api/public/project_clu2walwem1qm01w40v3yhw1f/subgraphs/${name}/${tag}/gn`;
}

type AllSdkRes<T> = {
  errors: unknown[];
  results: Array<T>;
};

export async function executeOnAllSdks<T>(
  fn: (sdk: EndpointSdk) => Promise<T>,
  options: { timeout: number } = { timeout: 30000 }
): Promise<AllSdkRes<T>> {
  const sdks = getAllSdks();
  try {
    const promises = sdks.map(sdk => withTimeout(fn(sdk), options.timeout));
    const settled = await withTimeout(Promise.allSettled(promises), options.timeout);
    return settled.reduce(
      (acc, res) => {
        if (res.status === 'fulfilled') {
          acc.results.push(res.value);
        } else {
          acc.errors.push(res.reason);
        }
        return acc;
      },
      { errors: [], results: [] } as AllSdkRes<T>
    );
  } catch (e) {
    logger.error(`Failed to execute on all sdks: ${e}`);
    return { errors: [e], results: [] };
  }
}

export async function paginate<R>({
  fetchPage,
  count,
  pageSize = 1000,
  fetchAtMost = 10000,
}: {
  fetchPage: (params: { skip: number; first: number }) => Promise<R>;
  count: (res: R) => number | number[];
  pageSize?: number;
  fetchAtMost?: number;
}): Promise<R[]> {
  const results: R[] = [];
  let skip = 0;
  let fetched = 0;

  while (fetched < fetchAtMost) {
    const res = await fetchPage({ skip, first: pageSize });
    results.push(res);
    const resCountOrCounts = count(res);
    const resCount = isArray(resCountOrCounts)
      ? Math.max(...resCountOrCounts) || 0
      : resCountOrCounts;

    logger.debug(`Fetched ${resCount} results, total fetched: ${fetched}`);
    if (resCount < pageSize) {
      break;
    }
    fetched += resCount;
    skip += pageSize;
  }

  return results;
}
