import type { IPlatformConstructor } from '../platforms/types';
import { Balancer } from '../platforms/balancer';
import { keys } from '../utils/object';
import { Curve } from '../platforms/curve';
import { Pendle } from '../platforms/pendle';
import { Aave } from '../platforms/aave';

export const platforms = {
  balancer: Balancer,
  aura: Balancer,
  curve: Curve,
  pendle: Pendle,
  equilibria: Pendle,
  mendi: Aave,
} as const satisfies Record<string, IPlatformConstructor>;

export type PlatformId = keyof typeof platforms;

export const allPlatformIds = keys(platforms);

export function isSupportedPlatform(id: string): id is PlatformId {
  return allPlatformIds.find(v => v === id) !== undefined;
}
