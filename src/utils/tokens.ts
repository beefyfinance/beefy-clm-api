import type { TokenFragment } from '../queries/codegen/sdk';
import { ZERO_ADDRESS } from './address';
import type { Token } from './timeline';

export function toToken(from: TokenFragment | undefined): Token | undefined {
  return from?.address && from.address !== ZERO_ADDRESS
    ? {
        address: from.address,
        decimals: Number(from.decimals),
        name: from.name || undefined,
      }
    : undefined;
}
