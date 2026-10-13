import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/app/globals.css';
import Home from '@/app/page';

const root = document.querySelector('#root');

if (!root) throw new Error('No se encontró el contenedor principal.');

createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
