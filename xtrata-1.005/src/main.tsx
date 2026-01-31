import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import PublicApp from './PublicApp';
import AdminGate from './admin/AdminGate';
import { ADMIN_PATH } from './config/admin';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

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
