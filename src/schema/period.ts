import { S } from 'fluent-json-schema';

const periodToSeconds = {
  '1h': 3600,
  '1d': 86400,
} as const;

export type Period = keyof typeof periodToSeconds;

export const allPeriodIds = Object.keys(periodToSeconds) as Period[];

export const periodSchema = S.string().enum(allPeriodIds).examples(allPeriodIds);

export function getPeriodSeconds(period: Period) {
  const seconds = periodToSeconds[period];
  if (seconds === undefined) {
    throw new Error(`Unknown period: ${period}`);
  }
  return seconds;
}
