import { Resolvers } from '../../../.graphclient';

const resolvers: Resolvers = {
  CLM: {
    chain: (_root, _args, context, _info) => {
      if (!('chainName' in context)) {
        throw new Error('chainName not found in context');
      }
      // @ts-ignore
      return context.chainName as string;
    },
  },
};

export default resolvers;
