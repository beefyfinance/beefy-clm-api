import { Type } from '@sinclair/typebox';

export const addressSchema = Type.String({
  minLength: 42,
  maxLength: 42,
  pattern: '^0x[a-fA-F0-9]{40}$',
  examples: [
    '0xe3EAc56810C885067dC4C43A8049A07D9Bb127a4',
    '0x9aA49971f4956D7831b2CD1c9AF7ED931b5f91BC',
    '0x4C32b8d26E6ab2Ce401772514C999768f63Afb4e',
  ],
});

export const transactionHashSchema = Type.String({
  minLength: 66,
  maxLength: 66,
  pattern: '^0x[a-fA-F0-9]{64}$',
  examples: ['0x1cbb149da00db8ee42ef15d24fb6b122ad6b3a534d383fab1e4389821958387f'],
});

export const hexSchema = Type.String({
  minLength: 3,
  pattern: '^0x[a-fA-F0-9]+$',
  examples: ['0x1234', '0x1a2b3c4d'],
});
