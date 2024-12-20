# beefy-clm-api

Access api for the CLM subgraph: https://github.com/beefyfinance/cowcentrated-subgraph

## add a new chain

- Add the chain to `src/config/chains.ts`
- `npm run test` and fix errs
- `npm run format`
- `npm run dev` 
    - http://localhost:4000/api/v1/status
    - http://localhost:4000/api/v1/vaults/:chain/1d
    - http://localhost:4000/api/v1/investor/:address/timeline
    
## Deploy the api

- `npm run deploy` to deploy the api


## Test urls
```

https://clm-api.beefy.finance/api/documentation
http://localhost:4000/api/documentation

https://clm-api.beefy.finance/api/v1/investor/0xb1F1000b4FCae7CD07370cE1A3E3b11270caC0dE/timeline
http://localhost:4000/api/v1/investor/0xb1F1000b4FCae7CD07370cE1A3E3b11270caC0dE/timeline

https://clm-api.beefy.finance/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/prices/1d/1717621855
http://localhost:4000/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/prices/1d/1717621855

https://clm-api.beefy.finance/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/prices/range/1d
http://localhost:4000/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/prices/range/1d

https://clm-api.beefy.finance/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/price
http://localhost:4000/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/price

https://clm-api.beefy.finance/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/harvests
http://localhost:4000/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/harvests

https://clm-api.beefy.finance/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/investors
http://localhost:4000/api/v1/vault/arbitrum/0x4c32b8d26e6ab2ce401772514c999768f63afb4e/investors

https://clm-api.beefy.finance/api/v1/vaults/arbitrum/1d
http://localhost:4000/api/v1/vaults/arbitrum/1d

https://clm-api.beefy.finance/api/v1/vaults/arbitrum/harvests/1717621855
http://localhost:4000/api/v1/vaults/arbitrum/harvests/1717621855

https://clm-api.beefy.finance/api/v1/vaults/arbitrum/harvests/1712591753?vaults=0xeea4114ab4fcb82a28c514e21d656ca78d75b1a9&vaults=0x5b65c2d8866ee0cd0d041beb0c6ea53a1cd058cd&vaults=0x63b54b0e06028802007c5f1eaeac03d5472b904a&vaults=0x56637ef065dc19ed71b7bd8b60dbda9a1ba12a7e&vaults=0x9aa49971f4956d7831b2cd1c9af7ed931b5f91bc&vaults=0x4c32b8d26e6ab2ce401772514c999768f63afb4e&vaults=0xc670f18d0feef76ccb7c4c3ce0226cc64c8b6356&vaults=0x809f9007172beaae23c08352995e60b9f4c11bb2&vaults=0x8d8e012d80e2a7b3b4de2a050c0cf923a0064a8e&vaults=0xedd08a6ff7aeee1e4dccc103198af06b2316d8b8&vaults=0x2a2e016f9c30c7da5a41b21c19e9619ff78ab673&vaults=0xd3d8d178aaecde5ba307c8806cb04346bb91e307

http://localhost:4000/api/v1/vaults/arbitrum/harvests/1712591753?vaults=0xeea4114ab4fcb82a28c514e21d656ca78d75b1a9&vaults=0x5b65c2d8866ee0cd0d041beb0c6ea53a1cd058cd&vaults=0x63b54b0e06028802007c5f1eaeac03d5472b904a&vaults=0x56637ef065dc19ed71b7bd8b60dbda9a1ba12a7e&vaults=0x9aa49971f4956d7831b2cd1c9af7ed931b5f91bc&vaults=0x4c32b8d26e6ab2ce401772514c999768f63afb4e&vaults=0xc670f18d0feef76ccb7c4c3ce0226cc64c8b6356&vaults=0x809f9007172beaae23c08352995e60b9f4c11bb2&vaults=0x8d8e012d80e2a7b3b4de2a050c0cf923a0064a8e&vaults=0xedd08a6ff7aeee1e4dccc103198af06b2316d8b8&vaults=0x2a2e016f9c30c7da5a41b21c19e9619ff78ab673&vaults=0xd3d8d178aaecde5ba307c8806cb04346bb91e307



https://clm-api.beefy.finance/api/v1/status
http://localhost:4000/api/v1/status
```