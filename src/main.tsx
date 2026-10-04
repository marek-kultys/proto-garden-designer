import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './state/store';
import './styles.css';

// Exposed so the screenshot harness can set up an identical design every run
// instead of trying to drive drag-and-drop, and so a tester can be walked
// through a specific scenario over a call.
//
// It is exposed in every build, not only in development, because the checks run
// against the built app and the single file testers receive — which also means
// anyone who opens the console can rewrite the design. That is deliberate and
// costs nothing in a prototype with no accounts, no storage beyond the tab and
// no network; it is written up in PRODUCT.md under *Known trade-offs*, together
// with what would have to change first if this ever grew either.
declare global {
  interface Window {
    gardenStore: typeof useStore;
  }
}
window.gardenStore = useStore;

const root = document.getElementById('root');
if (root === null) {
  // `index.html` carries the one mount point, and the single-file build inlines
  // that same document. If it is ever missing, the page is blank with nothing
  // in the console to say why — so say why.
  throw new Error('index.html has no #root element to mount the app into');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
