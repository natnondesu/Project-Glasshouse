import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/600.css';
// Thai subset only: Latin text keeps Geist.
import '@fontsource/ibm-plex-sans-thai/thai-400.css';
import '@fontsource/ibm-plex-sans-thai/thai-500.css';
import '@fontsource/ibm-plex-sans-thai/thai-600.css';
import '@fontsource/ibm-plex-sans-thai/thai-700.css';
import './styles/tokens.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { loadStoredLang } from './i18n';

// Load the remembered language first, then draw; a failed load still renders, in English.
void loadStoredLang()
  .catch((e: unknown) => console.error('Glasshouse could not load the saved language', e))
  .finally(() => {
    const root = document.getElementById('root');
    if (!root) throw new Error('Glasshouse could not find its #root element.');
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
