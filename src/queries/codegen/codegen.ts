import type { CodegenConfig } from '@graphql-codegen/cli';
import { SUBGRAPH_TAG } from '../../config/env';

const config: CodegenConfig = {
  schema: `https://api.goldsky.com/api/public/project_clu2walwem1qm01w40v3yhw1f/subgraphs/beefy-clm-arbitrum/${SUBGRAPH_TAG}/gn`,
  documents: ['src/queries/*.graphql'],
  generates: {
    'src/queries/codegen/sdk.ts': {
      plugins: ['typescript', 'typescript-operations', 'typescript-graphql-request'],
      config: {
        rawRequest: true,
        strictScalars: true,
        scalars: {
          BigInt: {
            input: 'string | number', // we can send a string or number to the server
            output: 'string', // server will always return a string
          },
          Bytes: '`0x${string}`', // equivalent to viem `Hex` type
          BigDecimal: 'string', // not used by our schema
          Int8: 'string', // not used by our schema
          Timestamp: 'string', // not used by our schema
        },
      },
    },
    'src/queries/codegen/schema.graphql': {
      plugins: ['schema-ast'],
    },
  },
};
export default config;
