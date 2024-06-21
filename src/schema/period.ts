import { type Static, Type } from '@sinclair/typebox';
import { S } from 'fluent-json-schema';

export const periodSchemaTypebox = Type.Union([Type.Literal('1h'), Type.Literal('1d')]);
export type Period = Static<typeof periodSchemaTypebox>;

const periodToSeconds = {
  '1h': 3600,
  '1d': 86400,
} as Record<Period, number>;

export const allPeriodIds = Object.keys(periodToSeconds) as Period[];

export const periodSchema = S.string().enum(allPeriodIds).examples(allPeriodIds);

export function getPeriodSeconds(period: Period) {
  const seconds = periodToSeconds[period];
  if (seconds === undefined) {
    throw new Error(`Unknown period: ${period}`);
  }
  return seconds;
}
