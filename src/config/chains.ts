import { Enum } from '@sinclair/typebox';
import { StringEnum } from '../utils/typebox';

export enum ChainId {
  arbitrum = 'arbitrum',
  base = 'base',
  optimism = 'optimism',
  moonbeam = 'moonbeam',
  linea = 'linea',
  polygon = 'polygon',
  zksync = 'zksync',
  manta = 'manta',
  mantle = 'mantle',
  sei = 'sei',
  bsc = 'bsc',
  avax = 'avax',
  rootstock = 'rootstock',
  scroll = 'scroll',
  mode = 'mode',
}

export const allChainIds: Array<ChainId> = Object.values(ChainId);
export const chainIdSchema = StringEnum(allChainIds);
export const chainIdAsKeySchema = Enum(ChainId);
