import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import './index.css';
import { QueryProvider } from './providers/QueryProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <div className="flex min-h-[100dvh] w-full min-w-0 flex-col">
        <App />
        <Toaster richColors closeButton position="top-right" />
      </div>
    </QueryProvider>
  </StrictMode>,
);
