import { S } from 'fluent-json-schema';
import { allProviderIds } from '../config/providers.js';

export const providerSchema = S.string().enum(allProviderIds).examples(allProviderIds);
