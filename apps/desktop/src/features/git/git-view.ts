import { computed, reactive } from 'vue';
import type { GitDiff } from './git-diff.ts';
import type { GitCommit, GitCommitDetail, GitLogPage } from './git-log.ts';

export interface GitViewClient {
  diff(cwd: string): Promise<GitDiff>;
  log(cwd: string, skip: number): Promise<GitLogPage>;
  show(cwd: string, hash: string): Promise<GitCommitDetail>;
}

// Rows above the history for uncommitted work, as in gitk.
export const LOCAL_STAGED = 'local:staged';
export const LOCAL_UNSTAGED = 'local:unstaged';

export const isLocalRow = (id: string | null) => id === LOCAL_STAGED || id === LOCAL_UNSTAGED;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// State of the git dialog of one split folder. Every request carries the
// generation it started in: answers that arrive after the dialog closed,
// was reopened or refreshed are dropped.
export function createGitView(client: GitViewClient) {
  const state = reactive({
    open: false,
    cwd: '',
    branch: '',
    changesLoading: false,
    changesError: '',
    changes: undefined as GitDiff | undefined,
    loading: false,
    loaded: false,
    error: '',
    commits: [] as GitCommit[],
    hasMore: false,
    selected: null as string | null,
    detailLoading: false,
    detailError: '',
    detail: undefined as GitCommitDetail | undefined,
  });
  let generation = 0;
  let detailRequest = 0;

  const local = computed(() => ({
    staged: Boolean(state.changes?.staged),
    unstaged: Boolean(state.changes?.unstaged || state.changes?.untracked.length),
  }));

  function reset() {
    Object.assign(state, {
      changesLoading: false,
      changesError: '',
      changes: undefined,
      loading: false,
      loaded: false,
      error: '',
      commits: [],
      hasMore: false,
      selected: null,
      detailLoading: false,
      detailError: '',
      detail: undefined,
    });
  }

  function select(id: string) {
    const request = ++detailRequest;
    Object.assign(state, {
      selected: id,
      detailLoading: false,
      detailError: '',
      detail: undefined,
    });
    if (isLocalRow(id)) return;
    const current = generation;
    state.detailLoading = true;
    client.show(state.cwd, id).then(
      (detail) => {
        if (current !== generation || request !== detailRequest) return;
        Object.assign(state, { detailLoading: false, detail });
      },
      (error: unknown) => {
        if (current !== generation || request !== detailRequest) return;
        Object.assign(state, { detailLoading: false, detailError: message(error) });
      },
    );
  }

  // Once both have loaded, the first row is selected, as in gitk.
  function selectFirstRow() {
    if (state.selected || state.changesLoading || !state.loaded) return;
    if (local.value.staged) select(LOCAL_STAGED);
    else if (local.value.unstaged) select(LOCAL_UNSTAGED);
    else if (state.commits[0]) select(state.commits[0].hash);
  }

  function loadChanges() {
    const current = generation;
    Object.assign(state, { changesLoading: true, changesError: '', changes: undefined });
    client.diff(state.cwd).then(
      (changes) => {
        if (current !== generation) return;
        Object.assign(state, { changesLoading: false, changes });
        selectFirstRow();
      },
      (error: unknown) => {
        if (current !== generation) return;
        Object.assign(state, { changesLoading: false, changesError: message(error) });
        selectFirstRow();
      },
    );
  }

  function loadCommits(skip: number) {
    const current = generation;
    Object.assign(state, { loading: true, error: '' });
    client.log(state.cwd, skip).then(
      (page) => {
        if (current !== generation) return;
        Object.assign(state, {
          commits: skip === 0 ? page.commits : [...state.commits, ...page.commits],
          hasMore: page.hasMore,
          loaded: true,
          loading: false,
        });
        selectFirstRow();
      },
      (error: unknown) => {
        if (current !== generation) return;
        Object.assign(state, { loading: false, loaded: true, error: message(error) });
        selectFirstRow();
      },
    );
  }

  function load() {
    generation += 1;
    reset();
    loadChanges();
    loadCommits(0);
  }

  return {
    state,
    local,
    open(cwd: string, branch: string) {
      Object.assign(state, { open: true, cwd, branch });
      load();
    },
    close() {
      generation += 1;
      state.open = false;
      reset();
    },
    refresh: load,
    loadMore() {
      if (state.loading || !state.hasMore) return;
      loadCommits(state.commits.length);
    },
    select,
  };
}

export type GitView = ReturnType<typeof createGitView>;
