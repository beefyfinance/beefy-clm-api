import type { IProviderConstructor } from '../providers/types';
import { EtherFi } from '../providers/etherfi';
import { Renzo } from '../providers/renzo';
import { keys } from '../utils/object';

export type ProviderId = 'etherfi' | 'renzo';

export const providers = {
  etherfi: EtherFi,
  renzo: Renzo,
} as const satisfies Record<ProviderId, IProviderConstructor>;

export const allProviderIds = keys(providers);
