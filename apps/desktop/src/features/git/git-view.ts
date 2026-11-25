import { reactive } from 'vue';
import type { GitDiff } from './git-diff.ts';
import type { GitCommit, GitCommitDetail, GitLogPage } from './git-log.ts';

export interface GitViewClient {
  diff(cwd: string): Promise<GitDiff>;
  log(cwd: string, skip: number): Promise<GitLogPage>;
  show(cwd: string, hash: string): Promise<GitCommitDetail>;
}

export type GitViewTab = 'changes' | 'history';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// State of the git dialog of one split folder. Every request carries the
// generation it started in: answers that arrive after the dialog closed,
// was reopened or moved on are dropped.
export function createGitView(client: GitViewClient) {
  const state = reactive({
    open: false,
    cwd: '',
    branch: '',
    tab: 'changes' as GitViewTab,
    changes: { loading: false, error: '', diff: undefined as GitDiff | undefined },
    history: {
      loaded: false,
      loading: false,
      error: '',
      commits: [] as GitCommit[],
      hasMore: false,
      selected: null as string | null,
      detailLoading: false,
      detailError: '',
      detail: undefined as GitCommitDetail | undefined,
    },
  });
  let generation = 0;
  let detailRequest = 0;

  function resetHistory() {
    Object.assign(state.history, {
      loaded: false,
      loading: false,
      error: '',
      commits: [],
      hasMore: false,
      selected: null,
      detailLoading: false,
      detailError: '',
      detail: undefined,
    });
  }

  function loadChanges() {
    const current = generation;
    Object.assign(state.changes, { loading: true, error: '', diff: undefined });
    client.diff(state.cwd).then(
      (diff) => {
        if (current === generation) Object.assign(state.changes, { loading: false, diff });
      },
      (error: unknown) => {
        if (current === generation) {
          Object.assign(state.changes, { loading: false, error: message(error) });
        }
      },
    );
  }

  function loadHistory(skip: number) {
    const current = generation;
    state.history.loading = true;
    state.history.error = '';
    client.log(state.cwd, skip).then(
      (page) => {
        if (current !== generation) return;
        state.history.commits =
          skip === 0 ? page.commits : [...state.history.commits, ...page.commits];
        state.history.hasMore = page.hasMore;
        state.history.loaded = true;
        state.history.loading = false;
      },
      (error: unknown) => {
        if (current !== generation) return;
        state.history.loading = false;
        state.history.error = message(error);
      },
    );
  }

  return {
    state,
    open(cwd: string, branch: string) {
      generation += 1;
      Object.assign(state, { open: true, cwd, branch, tab: 'changes' });
      resetHistory();
      loadChanges();
    },
    close() {
      generation += 1;
      state.open = false;
      resetHistory();
    },
    setTab(tab: GitViewTab) {
      state.tab = tab;
      if (tab === 'history' && !state.history.loaded && !state.history.loading) loadHistory(0);
    },
    refresh() {
      generation += 1;
      if (state.tab === 'changes') {
        resetHistory();
        loadChanges();
      } else {
        resetHistory();
        loadHistory(0);
      }
    },
    loadMore() {
      if (state.history.loading || !state.history.hasMore) return;
      loadHistory(state.history.commits.length);
    },
    select(hash: string) {
      const current = generation;
      const request = ++detailRequest;
      Object.assign(state.history, {
        selected: hash,
        detailLoading: true,
        detailError: '',
        detail: undefined,
      });
      client.show(state.cwd, hash).then(
        (detail) => {
          if (current !== generation || request !== detailRequest) return;
          Object.assign(state.history, { detailLoading: false, detail });
        },
        (error: unknown) => {
          if (current !== generation || request !== detailRequest) return;
          Object.assign(state.history, { detailLoading: false, detailError: message(error) });
        },
      );
    },
  };
}

export type GitView = ReturnType<typeof createGitView>;
