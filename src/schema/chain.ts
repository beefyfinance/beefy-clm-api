import { S } from 'fluent-json-schema';
import { allChainIds } from '../config/chains';

export const chainSchema = S.string().enum(allChainIds).examples(allChainIds);
