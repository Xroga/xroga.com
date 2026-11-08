import { createRoot } from 'react-dom/client';
import '@src/ui/index.css';
import { watchSystemTheme } from '@src/ui/theme';
import { App } from './App';
import { XROGA_PRODUCT } from '@src/xroga/product';

const container = document.querySelector('#app-container');
if (!container) throw new Error('Cannot find #app-container');
if (XROGA_PRODUCT) document.title = 'Xroga Browser Automation';
watchSystemTheme();
createRoot(container).render(<App />);
