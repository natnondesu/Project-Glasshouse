import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/spline-sans-mono/400.css';
import '@fontsource/spline-sans-mono/500.css';
import '@fontsource/spline-sans-mono/600.css';
import './styles/tokens.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyThemeChoice, readThemeChoice } from './ui/theme';

applyThemeChoice(readThemeChoice());

const root = document.getElementById('root');
if (!root) throw new Error('Glasshouse could not find its #root element.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
