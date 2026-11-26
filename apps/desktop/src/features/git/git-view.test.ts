import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { GitDiff } from './git-diff.ts';
import type { GitCommit, GitCommitDetail, GitLogPage } from './git-log.ts';
import { createGitView, LOCAL_STAGED, LOCAL_UNSTAGED, type GitViewClient } from './git-view.ts';

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
const noChanges: GitDiff = { staged: '', unstaged: '', truncated: false, untracked: [] };

test('abre el historial cargando a la vez los cambios locales y los commits', async () => {
  const { client, calls, diffs, logs } = fakeClient();
  const view = createGitView(client);

  view.open('/repo', 'main');
  assert.deepEqual(calls, ['diff /repo', 'log /repo 0']);
  logs[0]?.resolve({ commits: [commit('a'), commit('b')], hasMore: true });
  await flush();
  assert.equal(view.state.selected, null, 'waits for the local changes');

  diffs[0]?.resolve({ ...noChanges, staged: 'diff --git a/x b/x', untracked: ['n.txt'] });
  await flush();
  assert.deepEqual(view.local.value, { staged: true, unstaged: true });
  assert.equal(view.state.selected, LOCAL_STAGED, 'selects the first row, as gitk');
});

test('sin cambios locales elige el commit más reciente', async () => {
  const { client, diffs, logs, shows } = fakeClient();
  const view = createGitView(client);
  view.open('/repo', 'main');
  diffs[0]?.resolve(noChanges);
  logs[0]?.resolve({ commits: [commit('a')], hasMore: false });
  await flush();

  assert.deepEqual(view.local.value, { staged: false, unstaged: false });
  assert.equal(view.state.selected, 'a');
  shows[0]?.resolve({ body: 'a body', diff: '', truncated: false });
  await flush();
  assert.equal(view.state.detail?.body, 'a body');
});

test('elegir los cambios locales no pide nada al backend', async () => {
  const { client, calls, diffs, logs } = fakeClient();
  const view = createGitView(client);
  view.open('/repo', 'main');
  diffs[0]?.resolve({ ...noChanges, unstaged: 'diff --git a/x b/x' });
  logs[0]?.resolve({ commits: [commit('a')], hasMore: false });
  await flush();

  view.select(LOCAL_UNSTAGED);
  assert.equal(view.state.selected, LOCAL_UNSTAGED);
  assert.ok(!calls.some((call) => call.startsWith('show')));
});

test('carga más commits y una respuesta tardía nunca pisa la elegida', async () => {
  const { client, calls, diffs, logs, shows } = fakeClient();
  const view = createGitView(client);
  view.open('/repo', 'main');
  diffs[0]?.resolve({ ...noChanges, staged: 'diff --git a/x b/x' });
  logs[0]?.resolve({ commits: [commit('a')], hasMore: true });
  await flush();

  view.loadMore();
  logs[1]?.resolve({ commits: [commit('b')], hasMore: false });
  await flush();
  assert.deepEqual(
    view.state.commits.map((c) => c.hash),
    ['a', 'b'],
  );
  assert.ok(calls.includes('log /repo 1'));

  view.select('a');
  view.select('b');
  shows[1]?.resolve({ body: 'b body', diff: '', truncated: false });
  shows[0]?.resolve({ body: 'a body', diff: '', truncated: false });
  await flush();
  assert.equal(view.state.detail?.body, 'b body');
});

test('muestra los errores y descarta respuestas tras cerrar', async () => {
  const { client, diffs, logs } = fakeClient();
  const view = createGitView(client);
  view.open('/repo', 'main');
  diffs[0]?.reject('git diff no respondió');
  await flush();
  assert.equal(view.state.changesError, 'git diff no respondió');

  view.close();
  logs[0]?.resolve({ commits: [commit('a')], hasMore: false });
  await flush();
  assert.equal(view.state.open, false);
  assert.deepEqual(view.state.commits, []);
});

test('el diálogo es solo el historial, con los cambios locales arriba y el grafo', async () => {
  const dialog = await readFile(new URL('./GitDiffDialog.vue', import.meta.url), 'utf8');
  const history = await readFile(new URL('./GitHistory.vue', import.meta.url), 'utf8');
  const diffView = await readFile(new URL('./DiffView.vue', import.meta.url), 'utf8');
  const client = await readFile(new URL('./git-client.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(dialog, /role="tablist"/);
  assert.match(dialog, /<GitHistory/);
  assert.match(history, /computeGraph/);
  assert.match(history, /<svg/);
  assert.match(history, /Cambios en el índice/);
  assert.match(history, /Cambios sin preparar/);
  assert.match(history, /class="history-splitter"/);
  assert.match(history, /<DiffView/);
  assert.match(diffView, /buildFileTree/);
  assert.match(client, /invoke<GitLogPage>\('git_log', \{ cwd, skip \}\)/);
  assert.match(client, /invoke<GitCommitDetail>\('git_show', \{ cwd, hash \}\)/);
});
