import type { IProviderConstructor } from '../providers/types.js';
import { EtherFi } from '../providers/etherfi.js';
import { Renzo } from '../providers/renzo.js';
import { keys } from '../utils/object.js';

export type ProviderId = 'etherfi' | 'renzo';

export const providers = {
  etherfi: EtherFi,
  renzo: Renzo,
} as const satisfies Record<ProviderId, IProviderConstructor>;

export const allProviderIds = keys(providers);
