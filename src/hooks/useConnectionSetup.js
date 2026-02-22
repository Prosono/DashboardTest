import { useState, useEffect } from 'react';
import { validateUrl } from '../config/onboarding';
import { saveTokens, loadTokens, clearOAuthTokens, hasOAuthTokens } from '../services/oauthStorage';
import { clearStoredHaConfig, writeStoredHaConfig } from '../services/appAuth';
import { normalizeHaConfig } from '../utils/haConnections';

/**
 * Centralises connection-testing, OAuth login/logout and onboarding-step state.
 *
 * @param {object}   deps
 * @param {object}   deps.config
 * @param {function} deps.setConfig
 * @param {boolean}  deps.connected
 * @param {boolean}  deps.showOnboarding
 * @param {function} deps.setShowOnboarding
 * @param {boolean}  deps.showConfigModal
 * @param {function} deps.setShowConfigModal
 * @param {function} deps.t
 */
export function useConnectionSetup({
  config,
  setConfig,
  connected,
  showOnboarding,
  setShowOnboarding,
  showConfigModal,
  setShowConfigModal,
  t,
}) {
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingUrlError, setOnboardingUrlError] = useState('');
  const [onboardingTokenError, setOnboardingTokenError] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState(null);
  const [configTab, setConfigTab] = useState('connection');

  // ── Auto-close onboarding when OAuth connects ──────────────────────────
  useEffect(() => {
    if (connected && config.authMethod === 'oauth' && showOnboarding) {
      setShowOnboarding(false);
      setShowConfigModal(false);
    }
  }, [connected, config.authMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connection test (long-lived token) ─────────────────────────────────
  const testConnection = async () => {
    if (!validateUrl(config.url)) return;
    if (config.authMethod !== 'oauth' && !config.token) return;
    setTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const { createConnection, createLongLivedTokenAuth } = window.HAWS;
      const auth = createLongLivedTokenAuth(config.url, config.token);
      const testConn = await createConnection({ auth });
      testConn.close();
      setConnectionTestResult({ success: true, message: t('onboarding.testSuccess') });
    } catch {
      setConnectionTestResult({ success: false, message: t('onboarding.testFailed') });
    } finally {
      setTestingConnection(false);
    }
  };

  // ── OAuth login redirect ───────────────────────────────────────────────
  const startOAuthLogin = () => {
    if (!validateUrl(config.url) || !window.HAWS) return;
    const cleanUrl = config.url.replace(/\/$/, '');
    const normalized = normalizeHaConfig({
      ...config,
      url: cleanUrl,
      fallbackUrl: config.fallbackUrl || '',
      authMethod: 'oauth',
      token: '',
    });
    const primaryId = normalized.primaryConnectionId || normalized.connections?.[0]?.id || 'primary';
    const nextConnections = normalized.connections.map((connection) => (
      connection.id === primaryId
        ? { ...connection, url: cleanUrl, fallbackUrl: config.fallbackUrl || '', authMethod: 'oauth', token: '' }
        : connection
    ));
    writeStoredHaConfig({
      ...normalized,
      url: cleanUrl,
      fallbackUrl: config.fallbackUrl || '',
      authMethod: 'oauth',
      token: '',
      connections: nextConnections,
      primaryConnectionId: primaryId,
    });
    window.HAWS.getAuth({
      hassUrl: cleanUrl,
      saveTokens,
      loadTokens: () => Promise.resolve(loadTokens()),
    }).catch((err) => {
      console.error('OAuth login redirect failed:', err);
      setConnectionTestResult({ success: false, message: t('system.oauth.redirectFailed') });
    });
  };

  // ── OAuth logout ───────────────────────────────────────────────────────
  const handleOAuthLogout = () => {
    clearOAuthTokens();
    const normalizedForState = normalizeHaConfig(config || {});
    const primaryIdForState = normalizedForState.primaryConnectionId || normalizedForState.connections?.[0]?.id || 'primary';
    const stateConnections = normalizedForState.connections.map((connection) => (
      connection.id === primaryIdForState
        ? { ...connection, authMethod: 'oauth', token: '' }
        : connection
    ));
    setConfig(normalizeHaConfig({
      ...normalizedForState,
      authMethod: 'oauth',
      token: '',
      connections: stateConnections,
      primaryConnectionId: primaryIdForState,
    }));
    clearStoredHaConfig();
    const normalized = normalizeHaConfig(config || {});
    const primaryId = normalized.primaryConnectionId || normalized.connections?.[0]?.id || 'primary';
    const nextConnections = normalized.connections.map((connection) => (
      connection.id === primaryId
        ? { ...connection, authMethod: 'oauth', token: '' }
        : connection
    ));
    writeStoredHaConfig({
      ...normalized,
      authMethod: 'oauth',
      token: '',
      connections: nextConnections,
      primaryConnectionId: primaryId,
    });
  };

  // ── Derived: can the user advance past onboarding step 0? ──────────────
  const canAdvanceOnboarding = onboardingStep === 0
    ? config.authMethod === 'oauth'
      ? Boolean(config.url && validateUrl(config.url) && hasOAuthTokens())
      : Boolean(config.url && config.token && validateUrl(config.url) && connectionTestResult?.success)
    : true;

  const isOnboardingActive = showOnboarding;

  return {
    onboardingStep, setOnboardingStep,
    onboardingUrlError, setOnboardingUrlError,
    onboardingTokenError, setOnboardingTokenError,
    testingConnection, testConnection,
    connectionTestResult, setConnectionTestResult,
    configTab, setConfigTab,
    startOAuthLogin,
    handleOAuthLogout,
    canAdvanceOnboarding,
    isOnboardingActive,
  };
}
