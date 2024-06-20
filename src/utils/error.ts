import { SdkContext } from './sdk';
import { ChainId } from '../config/chains';

export class FriendlyError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'FriendlyError';
    this.cause = cause;
  }
}

function causeToMessage(cause: unknown, defaultMessage: string = 'Unknown error'): string {
  if (cause) {
    if (cause instanceof Error) {
      return cause.message || cause.toString();
    }
    if (typeof cause === 'object') {
      if ('message' in cause && typeof cause.message === 'string') {
        return cause.message;
      }
      if ('toString' in cause && typeof cause.toString === 'function') {
        return cause.toString();
      }
    }
  }

  return defaultMessage;
}

function causeToMessageGraph(
  cause: unknown,
  context: SdkContext,
  defaultMessage: string = 'Unknown graph query error'
): string {
  return `${causeToMessage(cause, defaultMessage)} (subgraph: ${context.subgraph}, tag: ${context.tag}, chain: ${context.chain})`;
}

export class GraphQueryError extends FriendlyError {
  public readonly subgraph: string;
  public readonly tag: string;
  public readonly chain: ChainId;

  constructor(cause: unknown, context: SdkContext) {
    super(causeToMessageGraph(cause, context), cause);
    this.name = 'GraphQueryError';
    this.subgraph = context.subgraph;
    this.tag = context.tag;
    this.chain = context.chain;
  }
}
