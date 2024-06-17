import { ChainId, allChainIds } from '../config/chains';
import { GraphQLClient } from 'graphql-request';
import { Sdk, getSdk } from '../queries/codegen/sdk';
import { createCachedFactoryByChainId } from './factory';
import { GraphQueryError } from './error';

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
