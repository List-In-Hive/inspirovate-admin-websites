// The draft must be edited by a person; retrying without a new revision cannot succeed.
export class NeedsAttentionError extends Error {
  constructor(message: string, readonly revision: number) { super(message); this.name = 'NeedsAttentionError'; }
}
// Another operation holds the project lock; the scheduler simply tries again on its next pass.
export class LockBusyError extends Error {
  constructor(message: string) { super(message); this.name = 'LockBusyError'; }
}
