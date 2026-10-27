import { createErrorStore } from '../features/errors/error.store.ts';
import { createLayoutStore } from '../features/layout/layout.store.ts';
import { createWorkspaceOperationStore } from '../features/workspace/workspace-operation.store.ts';

let lastId = 0;

export const useLayoutStore = createLayoutStore(() => `n${++lastId}`);
export const useWorkspaceOperationStore = createWorkspaceOperationStore();
export const useErrorStore = createErrorStore();
