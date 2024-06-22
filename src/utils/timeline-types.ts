import type { Static } from '@sinclair/typebox';
import type Decimal from 'decimal.js';
import type { ChainId } from '../config/chains';
import { ClmPositionInteractionType } from '../queries/codegen/sdk';
import { StringEnum } from './typebox';

export type BalanceDelta = {
  balance: Decimal;
  delta: Decimal;
};

export type Token = {
  address: string;
  decimals: number;
  name?: string | undefined;
};

export const actionsEnumSchema = StringEnum(Object.values(ClmPositionInteractionType));
type ActionsEnum = Static<typeof actionsEnumSchema>;

export type TimelineClmInteraction = {
  datetime: Date;
  chain: ChainId;
  transactionHash: string;
  managerToken: Token;
  rewardPoolToken: Token | undefined;
  token0ToUsd: Decimal;
  token1ToUsd: Decimal;
  manager: BalanceDelta;
  rewardPool: BalanceDelta | undefined;
  total: BalanceDelta;
  underlying0: BalanceDelta;
  underlying1: BalanceDelta;
  usd: BalanceDelta;
  actions: ActionsEnum[];
};
