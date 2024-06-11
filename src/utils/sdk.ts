import { getBuiltGraphSDK } from '../../.graphclient';
import { createCachedFactoryByChainId } from './factory';
import { ChainId } from '../config/chains';

export const getSdkForChain = createCachedFactoryByChainId((chainId: ChainId) =>
  getBuiltGraphSDK({ chainName: chainId })
);
