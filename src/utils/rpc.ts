import { createPublicClient, http, type MulticallBatchOptions, type PublicClient } from 'viem';
import { type ChainId, getChain } from '../config/chains';
import { createCachedFactoryByChainId } from './factory';

const defaultMulticallOptions: boolean | MulticallBatchOptions = {
  batchSize: 64,
  wait: 50,
};

const defaultBatchOptions: boolean | MulticallBatchOptions = false;

function createRpcClient(chainId: ChainId): PublicClient {
  const chain = getChain(chainId);
  const multicall = chain.multicall ?? defaultMulticallOptions;
  const batch = chain.batch ?? defaultBatchOptions;

  return createPublicClient({
    chain: chain.viem,
    batch: {
      multicall,
    },
    transport: http(chain.rpc, { batch }),
  });
}

export const getRpcClient = createCachedFactoryByChainId(createRpcClient);
