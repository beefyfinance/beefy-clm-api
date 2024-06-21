import { Type } from '@sinclair/typebox';
import { S } from 'fluent-json-schema';

export const addressSchema = S.string()
  .minLength(42)
  .maxLength(42)
  .pattern(/^0x[a-fA-F0-9]{40}$/)
  .examples([
    '0xe3EAc56810C885067dC4C43A8049A07D9Bb127a4',
    '0x9aA49971f4956D7831b2CD1c9AF7ED931b5f91BC',
    '0x4C32b8d26E6ab2Ce401772514C999768f63Afb4e',
  ]);

export const addressSchemaTypebox = Type.String({
  minLength: 42,
  maxLength: 42,
  pattern: '^0x[a-fA-F0-9]{40}$',
  examples: [
    '0xe3EAc56810C885067dC4C43A8049A07D9Bb127a4',
    '0x9aA49971f4956D7831b2CD1c9AF7ED931b5f91BC',
    '0x4C32b8d26E6ab2Ce401772514C999768f63Afb4e',
  ],
});
