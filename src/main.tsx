import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './state/store';
import './styles.css';

// Exposed so the screenshot harness can set up an identical design every run
// instead of trying to drive drag-and-drop, and so a tester can be walked
// through a specific scenario over a call.
declare global {
  interface Window {
    gardenStore: typeof useStore;
  }
}
window.gardenStore = useStore;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
