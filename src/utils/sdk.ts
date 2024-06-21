import { GraphQLClient } from 'graphql-request';
import { type ChainId, allChainIds } from '../config/chains';
import { type Sdk, getSdk } from '../queries/codegen/sdk';
import { GraphQueryError } from './error';
import { createCachedFactoryByChainId } from './factory';
import { getLoggerFor } from './log';

const SUBGRAPH_TAG = process.env.SUBGRAPH_TAG || 'latest';
const logger = getLoggerFor('sdk');

// adds the context to the response on all sdk queries
export type SdkContext = { chain: ChainId; subgraph: string; tag: string };
type EndpointSdk = {
  [key in keyof Sdk]: (
    ...args: Parameters<Sdk[key]>
  ) => Promise<Awaited<ReturnType<Sdk[key]>> & SdkContext>;
};

export const getAllSdks = () => allChainIds.flatMap(chain => getSdksForChain(chain));

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
    const resCount = count(res);
    logger.debug(`Fetched ${resCount} results, total fetched: ${fetched}`);
    if (resCount < pageSize) {
      break;
    }
    fetched += resCount;
    skip += pageSize;
  }

  return results;
}
