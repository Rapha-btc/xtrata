import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import PublicApp from './PublicApp';
import AdminGate from './admin/AdminGate';
import { ADMIN_PATH } from './config/admin';
import { ReadOnlyBackoffError } from './lib/contract/read-only';
import {
  hydrateQueryCache,
  setupQueryCachePersistence
} from './lib/cache/query-persist';
import {
  applyThemeToDocument,
  resolveInitialTheme
} from './lib/theme/preferences';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ReadOnlyBackoffError) {
          return failureCount < 1;
        }
        return failureCount < 1;
      },
      retryDelay: (failureCount, error) => {
        if (error instanceof ReadOnlyBackoffError) {
          return error.retryAfterMs;
        }
        return Math.min(1000 * 2 ** failureCount, 8000);
      },
      refetchOnWindowFocus: false
    }
  }
});

void hydrateQueryCache(queryClient);
setupQueryCachePersistence(queryClient);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

applyThemeToDocument(resolveInitialTheme());

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {window.location.pathname.startsWith(ADMIN_PATH) ? (
        <AdminGate>
          <App />
        </AdminGate>
      ) : (
        <PublicApp />
      )}
    </QueryClientProvider>
  </React.StrictMode>
);
