import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './router';
import { IS_ANALYZER_APP } from './config/appMode';
import './index.css';
// Start the shared th3scr1b3.art session early so requests carry the signed-in token.
import './services/sharedSupabase';

if (IS_ANALYZER_APP) document.title = 'Song Analyzer · th3scr1b3 Creative Engine';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>
);
