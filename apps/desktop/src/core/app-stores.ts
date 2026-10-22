import { createLayoutStore } from '../features/layout/layout.store.ts';

let lastId = 0;

export const useLayoutStore = createLayoutStore(() => `n${++lastId}`);
