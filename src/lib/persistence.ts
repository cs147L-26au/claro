export type CommitQueue<T> = { commit: (update: (current: T) => T) => Promise<void> };

// Serialize read-modify-write operations so two quick saves cannot overwrite one another.
// Failed writes leave both the committed state and the screen unchanged.
export function createCommitQueue<T>(initial: T, write: (next: T) => Promise<void>, onCommit: (next: T) => void): CommitQueue<T> {
  let current = initial;
  let pending = Promise.resolve();
  return {
    commit(update) {
      const work = pending.then(async () => {
        const next = update(current);
        await write(next);
        current = next;
        onCommit(next);
      });
      pending = work.catch(() => {});
      return work;
    },
  };
}
