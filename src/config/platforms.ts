import type { IPlatformConstructor } from '../platforms/types.js';
import { Balancer } from '../platforms/balancer.js';
import { keys } from '../utils/object.js';
import { Curve } from '../platforms/curve.js';
import { Pendle } from '../platforms/pendle.js';

export const platforms = {
  balancer: Balancer,
  aura: Balancer,
  curve: Curve,
  pendle: Pendle,
  equilibria: Pendle,
} as const satisfies Record<string, IPlatformConstructor>;

export type PlatformId = keyof typeof platforms;

export const allPlatformIds = keys(platforms);

export function isSupportedPlatform(id: string): id is PlatformId {
  return allPlatformIds.find(v => v === id) !== undefined;
}
