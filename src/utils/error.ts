export class FriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendlyError';
  }
}

export class GraphQueryError extends FriendlyError {
  constructor(e: any) {
    super(e?.message ?? e?.toString() ?? 'Unknown TheGraph error');
    this.name = 'GraphQueryError';
  }
}
