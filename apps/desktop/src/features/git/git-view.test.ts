import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { GitDiff } from './git-diff.ts';
import type { GitCommit, GitCommitDetail, GitLogPage } from './git-log.ts';
import { createGitView, type GitViewClient } from './git-view.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const commit = (hash: string): GitCommit => ({
  hash,
  parents: [],
  author: 'ana',
  time: 1,
  refs: [],
  subject: hash,
});

function fakeClient() {
  const calls: string[] = [];
  const diffs: ReturnType<typeof deferred<GitDiff>>[] = [];
  const logs: ReturnType<typeof deferred<GitLogPage>>[] = [];
  const shows: ReturnType<typeof deferred<GitCommitDetail>>[] = [];
  const client: GitViewClient = {
    diff(cwd) {
      calls.push(`diff ${cwd}`);
      const call = deferred<GitDiff>();
      diffs.push(call);
      return call.promise;
    },
    log(cwd, skip) {
      calls.push(`log ${cwd} ${skip}`);
      const call = deferred<GitLogPage>();
      logs.push(call);
      return call.promise;
    },
    show(cwd, hash) {
      calls.push(`show ${cwd} ${hash}`);
      const call = deferred<GitCommitDetail>();
      shows.push(call);
      return call.promise;
    },
  };
  return { client, calls, diffs, logs, shows };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('abre en Cambios y carga el historial solo al pedirlo', async () => {
  const { client, calls, diffs, logs } = fakeClient();
  const view = createGitView(client);

  view.open('/repo', 'main');
  assert.equal(view.state.tab, 'changes');
  assert.equal(view.state.changes.loading, true);
  diffs[0]?.resolve({ diff: '', truncated: false, untracked: [] });
  await flush();
  assert.equal(view.state.changes.loading, false);
  assert.deepEqual(calls, ['diff /repo']);

  view.setTab('history');
  logs[0]?.resolve({ commits: [commit('a'), commit('b')], hasMore: true });
  await flush();
  assert.deepEqual(
    view.state.history.commits.map((c) => c.hash),
    ['a', 'b'],
  );
  view.setTab('changes');
  view.setTab('history');
  assert.equal(logs.length, 1, 'the history is loaded once');
});

test('carga más commits y muestra el detalle del elegido', async () => {
  const { client, calls, logs, shows } = fakeClient();
  const view = createGitView(client);
  view.open('/repo', 'main');
  view.setTab('history');
  logs[0]?.resolve({ commits: [commit('a')], hasMore: true });
  await flush();

  view.loadMore();
  logs[1]?.resolve({ commits: [commit('b')], hasMore: false });
  await flush();
  assert.deepEqual(
    view.state.history.commits.map((c) => c.hash),
    ['a', 'b'],
  );
  assert.equal(view.state.history.hasMore, false);
  assert.ok(calls.includes('log /repo 1'));

  view.select('a');
  view.select('b');
  shows[1]?.resolve({ body: 'b body', diff: '', truncated: false });
  shows[0]?.resolve({ body: 'a body', diff: '', truncated: false });
  await flush();
  assert.equal(view.state.history.selected, 'b');
  assert.equal(view.state.history.detail?.body, 'b body', 'a late answer never replaces it');
});

test('muestra los errores y descarta respuestas tras cerrar', async () => {
  const { client, diffs, logs } = fakeClient();
  const view = createGitView(client);
  view.open('/repo', 'main');
  diffs[0]?.reject('git diff no respondió');
  await flush();
  assert.equal(view.state.changes.error, 'git diff no respondió');

  view.setTab('history');
  view.close();
  logs[0]?.resolve({ commits: [commit('a')], hasMore: false });
  await flush();
  assert.equal(view.state.open, false);
  assert.deepEqual(view.state.history.commits, []);
});

test('el diálogo tiene pestañas Cambios e Historial con el grafo', async () => {
  const dialog = await readFile(new URL('./GitDiffDialog.vue', import.meta.url), 'utf8');
  const history = await readFile(new URL('./GitHistory.vue', import.meta.url), 'utf8');
  const client = await readFile(new URL('./git-client.ts', import.meta.url), 'utf8');

  assert.match(dialog, /role="tablist"/);
  assert.match(dialog, /role="tab"/);
  assert.match(dialog, /\{ id: 'changes', label: 'Cambios' \}/);
  assert.match(dialog, /\{ id: 'history', label: 'Historial' \}/);
  assert.match(dialog, /<GitHistory/);
  assert.match(dialog, /<DiffView/);
  assert.match(history, /computeGraph/);
  assert.match(history, /<svg/);
  assert.match(client, /invoke<GitLogPage>\('git_log', \{ cwd, skip \}\)/);
  assert.match(client, /invoke<GitCommitDetail>\('git_show', \{ cwd, hash \}\)/);
});
