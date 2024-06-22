import { Type } from '@sinclair/typebox';
import { StringEnum } from '../utils/typebox';

export enum Period {
  '1h' = '1h',
  '1d' = '1d',
}

export const allPeriodIds: Array<Period> = Object.values(Period);
export const periodSchema = StringEnum(allPeriodIds);
export const periodAsKeySchema = Type.Enum(Period);

const periodToSeconds = {
  '1h': 3600,
  '1d': 86400,
} as Record<Period, number>;

export function getPeriodSeconds(period: Period) {
  const seconds = periodToSeconds[period];
  if (seconds === undefined) {
    throw new Error(`Unknown period: ${period}`);
  }
  return seconds;
}
