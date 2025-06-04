import { Enum } from '@sinclair/typebox';
import { StringEnum } from '../utils/typebox';

export enum ChainId {
  arbitrum = 'arbitrum',
  avax = 'avax',
  base = 'base',
  berachain = 'berachain',
  bsc = 'bsc',
  gnosis = 'gnosis',
  hyperevm = 'hyperevm',
  linea = 'linea',
  lisk = 'lisk',
  manta = 'manta',
  mantle = 'mantle',
  mode = 'mode',
  moonbeam = 'moonbeam',
  optimism = 'optimism',
  polygon = 'polygon',
  rootstock = 'rootstock',
  saga = 'saga',
  scroll = 'scroll',
  sei = 'sei',
  sonic = 'sonic',
  unichain = 'unichain',
  zksync = 'zksync',
}

export const allChainIds: Array<ChainId> = Object.values(ChainId);
export const chainIdSchema = StringEnum(allChainIds);
export const chainIdAsKeySchema = Enum(ChainId);
