import { createCachedFactoryByChainId } from './factory';
import { ChainId } from '../config/chains';
import { getMesh } from '@graphql-mesh/runtime';
import { getMeshOptions, getSdk } from '../../.graphclient';

export const getSdkForChain = createCachedFactoryByChainId(
  <TGlobalContext = any, TOperationContext = { chainName: ChainId }>(chainId: ChainId) => {
    return getMeshOptions()
      .then(meshOptions => {
        // beta is only available on arbitrum
        if (chainId !== 'arbitrum') {
          meshOptions.sources = meshOptions.sources.filter(
            source => source.name !== 'beefy-clm-beta'
          );
        }
        return getMesh(meshOptions);
      })
      .then(({ sdkRequesterFactory }) => {
        return sdkRequesterFactory({ chainName: chainId });
      })
      .then(sdkRequester => {
        return getSdk<TOperationContext, TGlobalContext>((...args) => sdkRequester(...args));
      });
  }
);
