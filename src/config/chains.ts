import { type Static, Type } from '@sinclair/typebox';

export const chainIdSchema = Type.Union(
  [
    Type.Literal('arbitrum'),
    Type.Literal('base'),
    Type.Literal('optimism'),
    Type.Literal('moonbeam'),
    Type.Literal('linea'),
    Type.Literal('polygon'),
  ],
  {
    description: 'Chain ID',
  }
);
export type ChainId = Static<typeof chainIdSchema>;

export const allChainIds: Array<ChainId> = [
  'arbitrum',
  'base',
  'optimism',
  'moonbeam',
  'linea',
  'polygon',
];
