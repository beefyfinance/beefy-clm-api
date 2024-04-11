import type { ChainId } from './chains.js';

// OwnershipTransferred(address,address)
// 0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0

// Note should be later of vault/strategy init block
export const vaultInitBlockByChain: Record<ChainId, Record<string, bigint>> = {
  ethereum: {
    'curve-veth': 19267100n, // 19267097n,
    'aura-weeth-ezeth-rseth': 19386359n, // 19383462n,
    'aura-weeth-reth': 19205684n, // 19205552n,
    'aura-ezeth-eth': 19205714n, // 19205695n,
  },
  base: {
    'aerodrome-ezeth-weth-s': 13005124n, // 13005107n,
    'aerodrome-ezeth-weth': 12723647n, // 12723637n,
  },
  arbitrum: {
    'equilibria-arb-eeth-27jun24': 199151878n, // 199151801n,
    'equilibria-arb-rseth-27jun24': 199151492n, // 199151411n,
    'equilibria-arb-ezeth-27jun24': 196811205n, // 196811117n,
    'equilibria-arb-rseth': 184576535n, // 184576432n,
    'equilibria-arb-eeth': 179921611n, // 179921508n,
    'equilibria-arb-ezeth': 189226499n, // 189226414n
  },
  linea: {
    'mendi-linea-ezeth': 3174775n, // 3174769n,
  },
};
