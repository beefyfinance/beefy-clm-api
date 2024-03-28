import type { IProviderConstructor } from '../providers/types.js';
import { EtherFi } from '../providers/etherfi.js';
import { keys } from '../utils/object.js';

export type ProviderId = 'etherfi';

export const providers = {
  etherfi: EtherFi,
} as const satisfies Record<ProviderId, IProviderConstructor>;

export const allProviderIds = keys(providers);
