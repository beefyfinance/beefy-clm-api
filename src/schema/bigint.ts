import { Type } from '@sinclair/typebox';

export const bigintSchema = Type.String({
  minLength: 1,
  pattern: '^[1-9][0-9]*',
  examples: ['195190029'],
});

export const bigDecimalSchema = Type.String({
  minLength: 1,
  pattern: '^[1-9][0-9]*(\\.[0-9]+)?$',
  examples: ['19519.00000029'],
});

export const timestampStrSchema = Type.String({
  minLength: 1,
  pattern: '^[1-9][0-9]*',
  examples: ['195190029'],
});

export const timestampNumberSchema = Type.Number({
  minimum: 1,
  examples: [195190029],
});
