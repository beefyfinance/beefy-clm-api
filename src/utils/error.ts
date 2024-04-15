import type { PlatformId } from '../config/platforms';
import type { ChainId } from '../config/chains';

export class FriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendlyError';
  }
}

export class DatabarnInvalidResponseError extends FriendlyError {
  constructor(chainId: ChainId, platformId: PlatformId, blockNo: bigint) {
    super(
      `Databarn returned an invalid response when fetching balances for chain ${chainId} and platform ${platformId} at block ${blockNo}.`
    );
    this.name = 'DatabarnInvalidResponseError';
  }
}

export class DatabarnEmptyResponseError extends FriendlyError {
  constructor(chainId: ChainId, platformId: PlatformId, blockNo: bigint) {
    super(
      `Databarn returned no balances for chain ${chainId} and platform ${platformId} at block ${blockNo}. This may not be an error.`
    );
    this.name = 'DatabarnEmptyResponseError';
  }
}
