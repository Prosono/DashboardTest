import { StrictMode, Component, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import './styles/index.css'
import App from './App.jsx'
import { ConfigProvider } from './contexts/ConfigContext'
import { PageProvider } from './contexts/PageContext'
import { NotificationProvider } from './contexts/NotificationContext'

const CHUNK_RELOAD_TS_KEY = '__smart_sauna_chunk_reload_ts__';
const CHUNK_RELOAD_WINDOW_MS = 15000;

const sendClientLog = (event, details = {}, level = 'info') => {
  if (typeof window === 'undefined' || typeof window.__SMART_SAUNA_CLIENT_LOG__ !== 'function') return;
  window.__SMART_SAUNA_CLIENT_LOG__(event, details, level);
};

const isDynamicImportChunkError = (errorLike) => {
  const message = String(errorLike?.message || errorLike || '').toLowerCase();
  if (!message) return false;
  return (
    message.includes('dynamically imported module')
    || message.includes('failed to fetch dynamically imported module')
    || message.includes('error loading dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('loading chunk')
    || message.includes('/assets/')
  );
};

const triggerChunkRecoveryReload = (errorLike) => {
  if (typeof window === 'undefined' || !isDynamicImportChunkError(errorLike)) return false;
  try {
    const now = Date.now();
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_TS_KEY) || 0);
    if (Number.isFinite(last) && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_TS_KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    sendClientLog('boot.unhandled_rejection', {
      message: String(event?.reason?.message || event?.reason || '').slice(0, 500),
      name: String(event?.reason?.name || '').slice(0, 120),
      stack: String(event?.reason?.stack || '').slice(0, 1200),
    }, 'error');
    if (triggerChunkRecoveryReload(event?.reason)) {
      event.preventDefault();
    }
  });

  window.addEventListener('error', (event) => {
    const target = event?.target;
    if (target && target.tagName === 'SCRIPT' && target.src && target.src.includes('/assets/')) {
      sendClientLog('boot.asset_script_error', { src: target.src }, 'error');
      triggerChunkRecoveryReload(new Error(`Script load failed: ${target.src}`));
      return;
    }
    sendClientLog('boot.window_error', {
      message: String(event?.message || '').slice(0, 500),
      filename: String(event?.filename || '').slice(0, 240),
      lineno: event?.lineno || 0,
      colno: event?.colno || 0,
      error: String(event?.error?.message || event?.error || '').slice(0, 500),
      stack: String(event?.error?.stack || '').slice(0, 1200),
    }, 'error');
  }, true);
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (triggerChunkRecoveryReload(error)) return;
    sendClientLog('boot.error_boundary', {
      message: String(error?.message || error || '').slice(0, 500),
      stack: String(error?.stack || '').slice(0, 1200),
      componentStack: String(errorInfo?.componentStack || '').slice(0, 1200),
    }, 'error');
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '20px'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '500px' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', fontWeight: '300' }}>
              Oops! Something went wrong
            </h1>
            <p style={{ marginBottom: '2rem', color: '#94a3b8', fontSize: '1.1rem' }}>
              The application encountered an unexpected error.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 32px',
                fontSize: '1rem',
                fontWeight: '600',
                color: 'white',
                background: '#3b82f6',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
              }}
              onMouseOver={(e) => e.target.style.background = '#2563eb'}
              onMouseOut={(e) => e.target.style.background = '#3b82f6'}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function BootProbe() {
  useEffect(() => {
    sendClientLog('boot.react.committed', {
      readyState: document.readyState,
    });
  }, []);
  return null;
}

sendClientLog('boot.bundle.start', {
  readyState: typeof document !== 'undefined' ? document.readyState : '',
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BootProbe />
      <ConfigProvider>
        <PageProvider>
          <NotificationProvider>
            <App />
          </NotificationProvider>
        </PageProvider>
      </ConfigProvider>
    </ErrorBoundary>
  </StrictMode>,
)
