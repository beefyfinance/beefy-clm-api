import { Enum } from '@sinclair/typebox';
import { StringEnum } from '../utils/typebox';

export enum ChainId {
  arbitrum = 'arbitrum',
  arc = 'arc',
  avax = 'avax',
  base = 'base',
  bsc = 'bsc',
  ethereum = 'ethereum',
  hyperevm = 'hyperevm',
  megaeth = 'megaeth',
  monad = 'monad',
  optimism = 'optimism',
  plasma = 'plasma',
  polygon = 'polygon',
  robinhood = 'robinhood',
  rootstock = 'rootstock',
  sonic = 'sonic',
}

export const allChainIds: Array<ChainId> = Object.values(ChainId);
export const chainIdSchema = StringEnum(allChainIds);
export const chainIdAsKeySchema = Enum(ChainId);
