import { Type } from '@sinclair/typebox';
import { StringEnum } from '../utils/typebox';

export enum Period {
  '1h' = '1h',
  '1d' = '1d',
  '1.1d' = '1.1d',
  '3d' = '3d',
  '3.1d' = '3.1d',
  '1w' = '1w',
  '1.1w' = '1.1w',
}

export const allPeriodIds: Array<Period> = Object.values(Period);
export const periodSchema = StringEnum(allPeriodIds);
export const periodAsKeySchema = Type.Enum(Period);

const periodToSeconds = {
  '1h': 3600,
  '1d': 86400,
  '1.1d': 95040,
  '3d': 259200,
  '3.1d': 267840,
  '1w': 604800,
  '1.1w': 665280,
} as Record<Period, number>;

export function getPeriodSeconds(period: Period) {
  const seconds = periodToSeconds[period];
  if (seconds === undefined) {
    throw new Error(`Unknown period: ${period}`);
  }
  return seconds;
}
