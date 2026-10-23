import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { createWorkspaceOperationStore } from './workspace-operation.store.ts';

let useWorkspaceOperationStore: ReturnType<typeof createWorkspaceOperationStore>;

beforeEach(() => {
  setActivePinia(createPinia());
  useWorkspaceOperationStore = createWorkspaceOperationStore();
});

test('permite una sola operación global de workspace a la vez', () => {
  const operation = useWorkspaceOperationStore();

  assert.equal(operation.begin('restore', 'ws-1'), true);
  assert.equal(operation.busy, true);
  assert.equal(operation.operation, 'restore');
  assert.equal(operation.workspaceId, 'ws-1');
  assert.equal(operation.begin('restore', 'ws-1'), false);
  assert.equal(operation.begin('restore', 'ws-2'), false);

  operation.finish();

  assert.equal(operation.busy, false);
  assert.equal(operation.operation, null);
  assert.equal(operation.workspaceId, null);
  assert.equal(operation.begin('restore', 'ws-2'), true);
});
