import { S } from 'fluent-json-schema';
import { allChainIds } from '../config/chains.js';

export const chainSchema = S.string().enum(allChainIds).examples(allChainIds);
