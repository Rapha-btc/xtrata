import { createRuntimeWorkspaceRootHandler } from '../runtime/workspace-redirect';

export const onRequest = createRuntimeWorkspaceRootHandler('System');
