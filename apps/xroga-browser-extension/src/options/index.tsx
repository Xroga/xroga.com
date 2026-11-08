import { createRoot } from 'react-dom/client';
import '@src/ui/index.css';
import { watchSystemTheme } from '@src/ui/theme';
import { installTestHook } from '@src/side-panel/test-hook';
import { App } from './App';
import { XROGA_PRODUCT } from '@src/xroga/product';

const container = document.querySelector('#app-container');
if (!container) throw new Error('Cannot find #app-container');
if (XROGA_PRODUCT) document.title = 'Xroga Browser Settings';
watchSystemTheme();
installTestHook(0, 'options');
createRoot(container).render(<App />);
