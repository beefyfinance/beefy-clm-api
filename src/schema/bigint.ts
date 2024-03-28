import { S } from 'fluent-json-schema';

export const bigintSchema = S.string()
  .minLength(1)
  .pattern(/^[1-9][0-9]*$/)
  .examples(['195190029']);
