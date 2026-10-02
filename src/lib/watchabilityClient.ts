// Client wiring for the matchup grid: localizes kickoff times to the visitor's zone and powers the
// "Sort: Kickoff | Most watchable" toolbar. Driven entirely by the DOM (data-watch / data-kickoff on
// each card), and a MutationObserver re-applies it whenever dashboard-controls.ts re-renders the
// grid for another week -- so it needs no changes to that file as long as the re-rendered cards
// carry the same attributes.
import { applySort, localizeKickoffs, type SortMode } from './watchability';

const DEFAULT_SORT: SortMode = 'kickoff';   // 'watchability' to lead with the guide order

const grid = document.getElementById('matchupGrid');
const toolbar = document.getElementById('wmToolbar');

const store = {
  get: (): string | null => { try { return sessionStorage.getItem('wm-sort'); } catch { return null; } },
  set: (v: string): void => { try { sessionStorage.setItem('wm-sort', v); } catch { /* private mode */ } },
};

if (grid && toolbar) {
  const saved = store.get();
  let mode: SortMode = saved === 'watchability' || saved === 'kickoff' ? saved : DEFAULT_SORT;

  const refresh = (): void => {
    observer.disconnect();                  // our own DOM edits must not retrigger us
    try {
      localizeKickoffs(grid);
      applySort(grid, mode);
      toolbar.hidden = grid.querySelectorAll('[data-watch]').length < 2;
      toolbar.querySelectorAll<HTMLButtonElement>('button[data-sort]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.sort === mode)));
    } finally {
      observer.observe(grid, { childList: true });
    }
  };
  const observer = new MutationObserver(refresh);

  toolbar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-sort]');
    if (!btn) return;
    mode = btn.dataset.sort as SortMode;
    store.set(mode);
    refresh();
  });

  refresh();
} else if (grid) {
  localizeKickoffs(grid);
}