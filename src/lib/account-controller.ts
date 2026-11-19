import type { AppData } from './model.ts';

type DataService = {
  load: () => Promise<AppData>;
  saveChanges: (before: AppData, after: AppData) => Promise<void>;
  importRecords: (data: AppData) => Promise<void>;
};
/** Serialize refreshes with writes; old accounts cannot publish or start queued writes. */
export function createAccountController(service: DataService, onData: (data: AppData) => void, onError: (error: unknown) => void) {
  let current: AppData | null = null;
  let active = true;
  let pending = Promise.resolve();
  const check = () => { if (!active) throw new Error('Your account changed. Reopen the screen to continue.'); };
  function enqueue(action: () => Promise<void>) {
    const work = pending.then(async () => { check(); await action(); });
    pending = work.catch(() => {});
    return work;
  }
  function publish(data: AppData) { check(); current = data; onData(data); }
  async function reload() { publish(await service.load()); }
  return {
    refresh: () => enqueue(reload),
    save: (update: (data: AppData) => AppData) => enqueue(async () => {
      if (!current) throw new Error('Your account is still loading.');
      const next = update(current);
      await service.saveChanges(current, next);
      publish(next);
      // The write succeeded. A failed follow-up refresh must not claim the save failed.
      try { await reload(); } catch (error) { if (active) onError(error); }
    }),
    importRecords: (data: AppData) => enqueue(async () => {
      await service.importRecords(data);
      try { await reload(); } catch (error) { if (active) onError(error); }
    }),
    dispose: () => { active = false; },
  };
}
