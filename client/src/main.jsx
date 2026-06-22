import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store/store.js';
import { loadFromStorage } from './store/authSlice.js';
import App from './App.jsx';
import './index.css';

// ── Hydrate auth state SYNCHRONOUSLY before first render ──────────
// loadFromStorage is a plain reducer (no async). Dispatching it here
// ensures Redux has the token/user before React paints any route,
// eliminating the flash-redirect-to-login on hard refresh.
store.dispatch(loadFromStorage());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
