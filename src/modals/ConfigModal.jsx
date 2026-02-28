import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModernDropdown from '../components/ui/ModernDropdown';
import M3Slider from '../components/ui/M3Slider';
import { GRADIENT_PRESETS } from '../contexts/ConfigContext';
import { hasOAuthTokens } from '../services/oauthStorage';
import {
  fetchSharedDashboardProfile,
  listSharedDashboardVersions,
  restoreSharedDashboardVersion,
  saveSharedDashboardProfile,
  toProfileId,
} from '../services/dashboardStorage';
import {
  X,
  Check,
  Home,
  Wifi,
  Settings,
  AlertCircle,
  AlertTriangle,
  Bell,
  Lock,
  Server,
  RefreshCw,
  Globe,
  Palette,
  Monitor,
  Sparkles,
  Download,
  ArrowRight,
  LayoutGrid,
  Columns,
  Sun,
  Moon,
  Link,
  ChevronDown,
  ChevronUp,
  Eye,
  LogIn,
  LogOut,
  Key,
  Search,
  Type,
  AlignLeft,
} from '../icons';
import { normalizeHaConfig, normalizeConnection, normalizeConnectionId } from '../utils/haConnections';
import { DEFAULT_NOTIFICATION_CONFIG, normalizeNotificationConfig } from '../utils/notificationConfig';

const stripRichTextToPlain = (input) => String(input || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'");

const sanitizeRichHtml = (input) => String(input || '')
  .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
  .replace(/\son\w+="[^"]*"/gi, '')
  .replace(/\son\w+='[^']*'/gi, '');

const isRichTextEffectivelyEmpty = (html) => stripRichTextToPlain(html).trim().length === 0;

function NotificationRichTextEditor({ value, onChange, placeholder, t }) {
  const editorRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isEmpty, setIsEmpty] = useState(() => isRichTextEffectivelyEmpty(value));

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const safeHtml = sanitizeRichHtml(value);
    if (el.innerHTML !== safeHtml) el.innerHTML = safeHtml;
    setIsEmpty(isRichTextEffectivelyEmpty(safeHtml));
  }, [value]);

  const emitChange = useCallback(() => {
    const html = sanitizeRichHtml(editorRef.current?.innerHTML || '');
    setIsEmpty(isRichTextEffectivelyEmpty(html));
    onChange?.(html);
  }, [onChange]);

  const runCommand = useCallback((command) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      document.execCommand(command, false, null);
      emitChange();
    }
  }, [emitChange]);

  const insertLineBreak = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
      document.execCommand('insertLineBreak', false, null);
      emitChange();
      return;
    }
    const current = sanitizeRichHtml(editorRef.current.innerHTML || '');
    const next = `${current}<br>`;
    editorRef.current.innerHTML = next;
    emitChange();
  }, [emitChange]);

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2 border-b border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--glass-bg-hover)_86%,transparent)]">
        <button
          type="button"
          onClick={() => runCommand('bold')}
          className="h-7 px-2 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs font-bold"
          title={t('notifications.formatBold')}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => runCommand('italic')}
          className="h-7 px-2 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs italic font-bold"
          title={t('notifications.formatItalic')}
        >
          I
        </button>
        <button
          type="button"
          onClick={insertLineBreak}
          className="h-7 px-2 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[11px] font-bold uppercase tracking-wider"
          title={t('notifications.formatLineBreak')}
        >
          {t('notifications.formatLineBreak')}
        </button>
      </div>
      <div className="relative">
        {isEmpty && !isFocused ? (
          <div className="absolute left-3 right-3 top-2 text-sm text-[var(--text-muted)] pointer-events-none">
            {placeholder}
          </div>
        ) : null}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setIsFocused(true)}
          onBlur={() => { setIsFocused(false); emitChange(); }}
          onInput={emitChange}
          className="min-h-[96px] max-h-56 overflow-y-auto custom-scrollbar px-3 py-2 text-sm text-[var(--text-primary)] outline-none whitespace-pre-wrap break-words"
        />
      </div>
    </div>
  );
}

export default function ConfigModal({
  open,
  isOnboardingActive,
  t,
  configTab,
  setConfigTab,
  onboardingSteps,
  onboardingStep,
  setOnboardingStep,
  canAdvanceOnboarding,
  connected,
  activeUrl,
  config,
  setConfig,
  onboardingUrlError,
  setOnboardingUrlError,
  onboardingTokenError,
  setOnboardingTokenError,
  setConnectionTestResult,
  connectionTestResult,
  validateUrl,
  testConnection,
  testingConnection,
  startOAuthLogin,
  handleOAuthLogout,
  themes,
  currentTheme,
  setCurrentTheme,
  language,
  setLanguage,
  inactivityTimeout,
  setInactivityTimeout,
  gridGapH,
  setGridGapH,
  gridGapV,
  setGridGapV,
  gridColumns,
  setGridColumns,
  cardBorderRadius,
  setCardBorderRadius,
  bgMode,
  setBgMode,
  bgColor,
  setBgColor,
  bgGradient,
  setBgGradient,
  bgImage,
  setBgImage,
  cardTransparency,
  setCardTransparency,
  cardBorderOpacity,
  setCardBorderOpacity,
  sectionSpacing,
  updateSectionSpacing,
  entities,
  getEntityImageUrl,
  callService,
  globalDashboardProfiles,
  globalStorageBusy,
  globalStorageError,
  refreshGlobalDashboards,
  saveGlobalDashboard,
  loadGlobalDashboard,
  currentUser,
  canEditDashboard,
  canManageAdministration = false,
  canManageNotifications = false,
  notificationConfig = DEFAULT_NOTIFICATION_CONFIG,
  notificationConfigLoading = false,
  notificationConfigSaving = false,
  notificationConfigMessage = '',
  onSaveNotificationConfig,
  onLogout,
  userAdminApi,
  onClose,
  onFinishOnboarding
}) {
  const [installingIds, setInstallingIds] = useState({});
  const [expandedNotes, setExpandedNotes] = useState({});
  const [layoutPreview, setLayoutPreview] = useState(false);
  const [layoutSections, setLayoutSections] = useState({ grid: true, spacing: false, cards: false });
  const [selectedGlobalDashboard, setSelectedGlobalDashboard] = useState('default');
  const [newGlobalDashboardName, setNewGlobalDashboardName] = useState('');
  const [globalActionMessage, setGlobalActionMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newUserDashboard, setNewUserDashboard] = useState('default');
  const [newUserClientId, setNewUserClientId] = useState('');
  const [newUserHaUrl, setNewUserHaUrl] = useState('');
  const [newUserHaToken, setNewUserHaToken] = useState('');
  const [newUserPhoneCountryCode, setNewUserPhoneCountryCode] = useState('+47');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [userEdits, setUserEdits] = useState({});
  const [savingUserIds, setSavingUserIds] = useState({});
  const [deletingUserIds, setDeletingUserIds] = useState({});
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [editUserDashboardOptions, setEditUserDashboardOptions] = useState([]);
  const [importingDashboard, setImportingDashboard] = useState(false);
  const [clients, setClients] = useState([]);
  const [newClientId, setNewClientId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [newClientAdminUsername, setNewClientAdminUsername] = useState('');
  const [newClientAdminPassword, setNewClientAdminPassword] = useState('');
  const [storageSection, setStorageSection] = useState('users');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [showCreateClientAdminModal, setShowCreateClientAdminModal] = useState(false);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [showDeleteClientModal, setShowDeleteClientModal] = useState(false);
  const [editClientId, setEditClientId] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [deleteClientId, setDeleteClientId] = useState('');
  const [deleteClientConfirmText, setDeleteClientConfirmText] = useState('');
  const [connectionManageClientId, setConnectionManageClientId] = useState('');
  const [managedConnectionConfig, setManagedConnectionConfig] = useState(() => normalizeHaConfig({
    url: '',
    fallbackUrl: '',
    authMethod: 'oauth',
    token: '',
    connections: [{
      id: 'primary',
      name: 'Primary',
      url: '',
      fallbackUrl: '',
      authMethod: 'oauth',
      token: '',
      oauthTokens: null,
    }],
    primaryConnectionId: 'primary',
  }));
  const [managedConnectionId, setManagedConnectionId] = useState('primary');
  const [managedConnectionLoading, setManagedConnectionLoading] = useState(false);
  const [managedConnectionSaving, setManagedConnectionSaving] = useState(false);
  const [assignTargetUserId, setAssignTargetUserId] = useState('');
  const [dashboardProfilesByClient, setDashboardProfilesByClient] = useState({});
  const [dashboardVersions, setDashboardVersions] = useState([]);
  const [selectedDashboardVersionId, setSelectedDashboardVersionId] = useState('');
  const [loadingDashboardVersions, setLoadingDashboardVersions] = useState(false);
  const [restoringDashboardVersion, setRestoringDashboardVersion] = useState(false);
  const [notificationDraft, setNotificationDraft] = useState(() => normalizeNotificationConfig(notificationConfig || DEFAULT_NOTIFICATION_CONFIG));
  const [notificationDirty, setNotificationDirty] = useState(false);
  const [notificationSaveMessage, setNotificationSaveMessage] = useState('');
  const [notificationRuleSearch, setNotificationRuleSearch] = useState({});
  const [notificationRuleDomain, setNotificationRuleDomain] = useState({});
  const [notificationRuleReferenceEntity, setNotificationRuleReferenceEntity] = useState({});
  const [notificationRuleExpanded, setNotificationRuleExpanded] = useState({});
  const [twilioDraft, setTwilioDraft] = useState({
    accountSid: '',
    authToken: '',
    fromNumber: '',
    hasAuthToken: false,
    updatedAt: null,
  });
  const [twilioConfigLoading, setTwilioConfigLoading] = useState(false);
  const [twilioConfigSaving, setTwilioConfigSaving] = useState(false);
  const [twilioConfigMessage, setTwilioConfigMessage] = useState('');
  const [twilioTestCountryCode, setTwilioTestCountryCode] = useState('+47');
  const [twilioTestTo, setTwilioTestTo] = useState('');
  const [twilioTestMessage, setTwilioTestMessage] = useState('Smart Sauna test message');
  const [twilioTestSending, setTwilioTestSending] = useState(false);
  const [appActionHistory, setAppActionHistory] = useState([]);
  const [appActionHistoryLoading, setAppActionHistoryLoading] = useState(false);
  const [appActionHistoryBusy, setAppActionHistoryBusy] = useState(false);
  const [appActionHistoryMessage, setAppActionHistoryMessage] = useState('');
  const notificationEntityOptions = useMemo(() => (
    Object.entries(entities || {})
      .map(([id, entity]) => {
        const domain = String(id || '').split('.')[0] || 'other';
        const friendlyName = String(entity?.attributes?.friendly_name || '').trim();
        const state = String(entity?.state ?? '').trim();
        return {
          id,
          domain,
          friendlyName,
          state,
          searchKey: `${id} ${domain} ${friendlyName} ${state}`.toLowerCase(),
        };
      })
      .sort((a, b) => {
        const domainCmp = a.domain.localeCompare(b.domain);
        if (domainCmp !== 0) return domainCmp;
        const labelA = a.friendlyName || a.id;
        const labelB = b.friendlyName || b.id;
        return labelA.localeCompare(labelB);
      })
  ), [entities]);
  const notificationEntityIds = useMemo(
    () => notificationEntityOptions.map((option) => option.id),
    [notificationEntityOptions],
  );
  const notificationEntityDomains = useMemo(
    () => Array.from(new Set(notificationEntityOptions.map((option) => option.domain))).sort((a, b) => a.localeCompare(b)),
    [notificationEntityOptions],
  );
  const notificationRecipientUsers = useMemo(() => (
    (Array.isArray(users) ? users : [])
      .map((user) => ({
        id: String(user?.id || '').trim(),
        role: String(user?.role || 'user').trim().toLowerCase(),
        label: String(user?.fullName || user?.username || user?.id || '').trim(),
      }))
      .filter((user) => user.id && user.label)
      .sort((a, b) => a.label.localeCompare(b.label))
  ), [users]);

  const normalizeRole = (role) => {
    const value = String(role || '').trim();
    if (value === 'admin' || value === 'inspector') return value;
    return 'user';
  };

  const buildUserEditState = (user) => ({
    username: user?.username || '',
    role: normalizeRole(user?.role),
    assignedDashboardId: user?.assignedDashboardId || 'default',
    haUrl: user?.haUrl || '',
    haToken: user?.haToken || '',
    phoneCountryCode: user?.phoneCountryCode || '+47',
    phone: user?.phone || '',
    password: '',
  });

  const isLayoutPreview = configTab === 'layout' && layoutPreview;
  const isAdmin = currentUser?.role === 'admin';
  const isInspector = currentUser?.role === 'inspector';
  const canManageConnection = currentUser?.isPlatformAdmin === true;
  const canAccessStorage = canManageAdministration;
  const canAccessNotifications = canManageNotifications && isAdmin;
  const canAccessUpdates = isAdmin && !currentUser?.isPlatformAdmin;

  useEffect(() => {
    if (configTab !== 'layout' && layoutPreview) {
      setLayoutPreview(false);
    }
  }, [configTab, layoutPreview]);

  useEffect(() => {
    if (layoutPreview && configTab !== 'layout') {
      setConfigTab('layout');
    }
  }, [layoutPreview, configTab, setConfigTab]);

  useEffect(() => {
    if (currentUser?.isPlatformAdmin === true) return;
    if (!Array.isArray(globalDashboardProfiles) || globalDashboardProfiles.length === 0) return;
    const exists = globalDashboardProfiles.some((profile) => profile.id === selectedGlobalDashboard);
    if (!exists) {
      setSelectedGlobalDashboard(globalDashboardProfiles[0].id || 'default');
    }
  }, [globalDashboardProfiles, selectedGlobalDashboard, currentUser?.isPlatformAdmin]);

  useEffect(() => {
    if (configTab === 'storage' && refreshGlobalDashboards) {
      refreshGlobalDashboards();
    }
  }, [configTab, refreshGlobalDashboards]);

  useEffect(() => {
    setNotificationDraft(normalizeNotificationConfig(notificationConfig || DEFAULT_NOTIFICATION_CONFIG));
    setNotificationDirty(false);
    setNotificationRuleSearch({});
    setNotificationRuleDomain({});
    setNotificationRuleReferenceEntity({});
    setNotificationRuleExpanded({});
  }, [notificationConfig]);

  const loadAppActionHistory = useCallback(async () => {
    if (!canAccessNotifications || typeof userAdminApi?.fetchAppActionHistory !== 'function') {
      setAppActionHistory([]);
      return;
    }
    setAppActionHistoryLoading(true);
    setAppActionHistoryMessage('');
    try {
      const rows = await userAdminApi.fetchAppActionHistory(200);
      setAppActionHistory(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setAppActionHistory([]);
      setAppActionHistoryMessage(String(error?.message || t('notifications.appActionHistoryLoadFailed')));
    } finally {
      setAppActionHistoryLoading(false);
    }
  }, [canAccessNotifications, t, userAdminApi]);

  const clearAllAppActions = useCallback(async () => {
    if (!canAccessNotifications || typeof userAdminApi?.clearAppActionHistory !== 'function') return;
    const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function'
      ? true
      : window.confirm(t('notifications.appActionHistoryClearConfirm'));
    if (!confirmed) return;
    setAppActionHistoryBusy(true);
    setAppActionHistoryMessage('');
    try {
      const rows = await userAdminApi.clearAppActionHistory();
      setAppActionHistory(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setAppActionHistoryMessage(String(error?.message || t('notifications.appActionHistoryClearFailed')));
    } finally {
      setAppActionHistoryBusy(false);
    }
  }, [canAccessNotifications, t, userAdminApi]);

  const deleteAppActionEntry = useCallback(async (entryId) => {
    const normalizedId = String(entryId || '').trim();
    if (!normalizedId || typeof userAdminApi?.deleteAppActionHistoryEntry !== 'function') return;
    setAppActionHistoryBusy(true);
    setAppActionHistoryMessage('');
    try {
      const rows = await userAdminApi.deleteAppActionHistoryEntry(normalizedId);
      setAppActionHistory(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setAppActionHistoryMessage(String(error?.message || t('notifications.appActionHistoryDeleteFailed')));
    } finally {
      setAppActionHistoryBusy(false);
    }
  }, [t, userAdminApi]);

  useEffect(() => {
    if (!open || configTab !== 'notifications' || !canAccessNotifications) return;
    void loadAppActionHistory();
  }, [open, configTab, canAccessNotifications, loadAppActionHistory]);

  useEffect(() => {
    if (!open || configTab !== 'notifications' || !canAccessNotifications || !userAdminApi?.listUsers) return;
    let cancelled = false;
    userAdminApi.listUsers()
      .then((list) => {
        if (cancelled) return;
        const nextUsers = Array.isArray(list) ? list : [];
        setUsers(nextUsers);
        setUserEdits((prev) => {
          const next = { ...prev };
          nextUsers.forEach((user) => {
            next[user.id] = {
              ...(next[user.id] || {}),
              ...buildUserEditState(user),
              password: next[user.id]?.password || '',
            };
          });
          return next;
        });
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => { cancelled = true; };
  }, [open, configTab, canAccessNotifications, userAdminApi]);

  useEffect(() => {
    if (!open || configTab !== 'notifications' || !canAccessNotifications || !isPlatformAdmin || !userAdminApi?.fetchTwilioSmsConfig) return;
    let cancelled = false;
    setTwilioConfigLoading(true);
    setTwilioConfigMessage('');
    userAdminApi.fetchTwilioSmsConfig()
      .then((cfg) => {
        if (cancelled) return;
        const next = cfg && typeof cfg === 'object' ? cfg : {};
        setTwilioDraft({
          accountSid: String(next.accountSid || '').trim(),
          fromNumber: String(next.fromNumber || '').trim(),
          authToken: '',
          hasAuthToken: Boolean(next.hasAuthToken),
          updatedAt: next.updatedAt || null,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setTwilioConfigMessage(String(error?.message || 'Failed to load Twilio settings'));
        }
      })
      .finally(() => {
        if (!cancelled) setTwilioConfigLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, configTab, canAccessNotifications, isPlatformAdmin, userAdminApi]);

  useEffect(() => {
    if (configTab !== 'storage' || !canManageAdministration || !userAdminApi?.listUsers) return;
    let cancelled = false;
    userAdminApi.listUsers().then((list) => {
      if (!cancelled) {
        const nextUsers = Array.isArray(list) ? list : [];
        setUsers(nextUsers);
        setUserEdits((prev) => {
          const next = { ...prev };
          nextUsers.forEach((user) => {
            next[user.id] = {
              ...(next[user.id] || {}),
              ...buildUserEditState(user),
              password: next[user.id]?.password || '',
            };
          });
          return next;
        });
      }
    }).catch(() => {
      if (!cancelled) {
        setUsers([]);
        setUserEdits({});
      }
    });
    return () => { cancelled = true; };
  }, [configTab, canManageAdministration, userAdminApi]);

  useEffect(() => {
    const canClientMgmtFromAuth = currentUser?.isPlatformAdmin === true;
    if ((configTab !== 'storage' && configTab !== 'connection') || !canManageAdministration || !canClientMgmtFromAuth || !userAdminApi?.listClients) return;
    let cancelled = false;
    userAdminApi.listClients().then((list) => {
      if (cancelled) return;
      const nextClients = Array.isArray(list) ? list : [];
      const canClientMgmt = canClientMgmtFromAuth && typeof userAdminApi?.listClients === 'function';
      setClients(nextClients);
      if (!nextClients.some((client) => client.id === selectedClientId)) {
        setSelectedClientId(nextClients[0]?.id || '');
      }
      if (!nextClients.some((client) => client.id === connectionManageClientId)) {
        setConnectionManageClientId(nextClients[0]?.id || '');
      }
      if (canClientMgmt && (!newUserClientId || !nextClients.some((client) => client.id === newUserClientId))) {
        setNewUserClientId(currentUser?.clientId || nextClients[0]?.id || '');
      }
    }).catch(() => {
      if (!cancelled) {
        setClients([]);
      }
    });
    return () => { cancelled = true; };
  }, [configTab, canManageAdministration, userAdminApi, selectedClientId, connectionManageClientId, currentUser?.clientId, currentUser?.isPlatformAdmin, newUserClientId]);

  useEffect(() => {
    if (configTab !== 'storage') return;
    if (storageSection !== 'clients') return;
    if (!canManageAdministration || !userAdminApi?.listClients) {
      setStorageSection('users');
    }
  }, [configTab, storageSection, canManageAdministration, userAdminApi]);

  const handleClose = () => {
    if (!isOnboardingActive) onClose?.();
  };

  const TABS = [
    { key: 'connection', icon: Wifi, label: t('system.tabConnection') },
    ...(canAccessNotifications ? [{ key: 'notifications', icon: Bell, label: t('system.tabNotifications') }] : []),
    ...(canAccessStorage ? [{ key: 'storage', icon: Server, label: t('userMgmt.menu') }] : []),
    ...(canAccessUpdates ? [{ key: 'updates', icon: Download, label: t('updates.title') }] : []),
  ];

  const availableTabs = isLayoutPreview
    ? [{ key: 'layout', icon: LayoutGrid, label: t('system.tabLayout') }]
    : TABS;
  const activeConfigTab = availableTabs.some((tab) => tab.key === configTab) ? configTab : 'connection';
  const canManageClients = currentUser?.isPlatformAdmin === true && typeof userAdminApi?.listClients === 'function';
  const isPlatformAdmin = currentUser?.isPlatformAdmin === true;
  const selectedManagedClient = clients.find((client) => client.id === connectionManageClientId) || null;
  const managedConnections = Array.isArray(managedConnectionConfig?.connections) ? managedConnectionConfig.connections : [];
  const selectedManagedConnection = managedConnections.find((connection) => connection.id === managedConnectionId)
    || managedConnections[0]
    || null;
  const activeDashboardClientId = canManageClients
    ? String(selectedClientId || '').trim()
    : String(currentUser?.clientId || '').trim();
  const normalizedSelectedDashboardId = toProfileId(selectedGlobalDashboard || 'default');

  const refreshDashboardVersions = useCallback(async () => {
    const dashboardId = toProfileId(selectedGlobalDashboard || 'default');
    if (!dashboardId) {
      setDashboardVersions([]);
      setSelectedDashboardVersionId('');
      return [];
    }

    setLoadingDashboardVersions(true);
    try {
      let versions = [];
      if (canManageClients && userAdminApi?.listClientDashboardVersions) {
        const clientId = String(selectedClientId || '').trim();
        if (!clientId) {
          setDashboardVersions([]);
          setSelectedDashboardVersionId('');
          return [];
        }
        versions = await userAdminApi.listClientDashboardVersions(clientId, dashboardId, 40);
      } else {
        versions = await listSharedDashboardVersions(dashboardId, 40);
      }

      const safeVersions = Array.isArray(versions) ? versions : [];
      setDashboardVersions(safeVersions);
      setSelectedDashboardVersionId((prev) => (
        safeVersions.some((entry) => entry.id === prev) ? prev : (safeVersions[0]?.id || '')
      ));
      return safeVersions;
    } catch (error) {
      setDashboardVersions([]);
      setSelectedDashboardVersionId('');
      setGlobalActionMessage(error?.message || 'Failed to load dashboard history');
      return [];
    } finally {
      setLoadingDashboardVersions(false);
    }
  }, [canManageClients, selectedClientId, selectedGlobalDashboard, userAdminApi]);

  useEffect(() => {
    if (!open || !canManageClients || !canManageAdministration || !userAdminApi?.listClientDashboards) return;
    if (configTab !== 'storage') return;
    const clientIds = Array.from(new Set([
      ...users.map((user) => String(user?.clientId || '').trim()).filter(Boolean),
      ...clients.map((client) => String(client?.id || '').trim()).filter(Boolean),
      String(newUserClientId || '').trim(),
      String(selectedClientId || '').trim(),
    ].filter(Boolean)));
    if (!clientIds.length) return;
    let cancelled = false;
    Promise.all(clientIds.map(async (clientId) => {
      try {
        const dashboards = await userAdminApi.listClientDashboards(clientId);
        return [clientId, Array.isArray(dashboards) ? dashboards : []];
      } catch {
        return [clientId, null];
      }
    })).then((entries) => {
      if (cancelled) return;
      setDashboardProfilesByClient((prev) => {
        const next = { ...prev };
        entries.forEach(([clientId, dashboards]) => {
          if (Array.isArray(dashboards)) {
            const prevList = Array.isArray(prev[clientId]) ? prev[clientId] : [];
            if (dashboards.length > 0 || prevList.length === 0) {
              next[clientId] = dashboards;
            }
          }
        });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [
    open,
    canManageClients,
    canManageAdministration,
    configTab,
    users,
    clients,
    newUserClientId,
    selectedClientId,
    userAdminApi,
  ]);

  useEffect(() => {
    if (activeConfigTab !== 'connection' || !isPlatformAdmin || !connectionManageClientId || !userAdminApi?.fetchClientHaConfig) return;
    let cancelled = false;
    setManagedConnectionLoading(true);
    userAdminApi.fetchClientHaConfig(connectionManageClientId)
      .then((cfg) => {
        if (cancelled) return;
        const normalized = normalizeHaConfig(cfg || {});
        setManagedConnectionConfig(normalized);
        setManagedConnectionId(normalized.primaryConnectionId || normalized.connections?.[0]?.id || 'primary');
      })
      .catch(() => {
        if (!cancelled) {
          const fallback = normalizeHaConfig({
            url: '',
            fallbackUrl: '',
            authMethod: 'oauth',
            token: '',
          });
          setManagedConnectionConfig(fallback);
          setManagedConnectionId(fallback.primaryConnectionId || 'primary');
        }
      })
      .finally(() => {
        if (!cancelled) setManagedConnectionLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeConfigTab, isPlatformAdmin, connectionManageClientId, userAdminApi]);

  useEffect(() => {
    if (!canManageClients) return;
    const options = Array.isArray(dashboardProfilesByClient[selectedClientId]) ? dashboardProfilesByClient[selectedClientId] : [];
    if (!options.length) return;
    const hasCurrent = options.some((profile) => String(profile?.id || '').trim() === String(selectedGlobalDashboard || '').trim());
    if (!hasCurrent) {
      setSelectedGlobalDashboard(String(options[0]?.id || 'default').trim() || 'default');
    }
  }, [canManageClients, dashboardProfilesByClient, selectedClientId, selectedGlobalDashboard]);

  useEffect(() => {
    if (!open || configTab !== 'storage' || storageSection !== 'dashboards') return;
    refreshDashboardVersions();
  }, [open, configTab, storageSection, normalizedSelectedDashboardId, activeDashboardClientId, refreshDashboardVersions]);

  if (!open) return null;

  const handleInstallUpdate = (entityId) => {
    setInstallingIds(prev => ({ ...prev, [entityId]: true }));
    if (callService) {
      callService('update', 'install', { entity_id: entityId });
    }
    setTimeout(() => {
      setInstallingIds(prev => ({ ...prev, [entityId]: false }));
    }, 30000);
  };

  const handleSkipUpdate = (entityId) => {
    if (callService) {
      callService('update', 'skip', { entity_id: entityId });
    }
  };

  // ─── Auth Method Toggle (shared between connection tab & onboarding) ───
  const authMethod = config.authMethod || 'oauth';
  const isOAuth = authMethod === 'oauth';

  const renderAuthMethodToggle = (showRecommended = false) => (
    <div className="space-y-2">
      <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('system.authMethod')}</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { if (!canManageConnection) return; updatePrimaryConnectionConfig({ authMethod: 'oauth', token: '' }); setConnectionTestResult(null); }}
          disabled={!canManageConnection}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all relative ${isOAuth ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)]'} ${!canManageConnection ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <LogIn className="w-3.5 h-3.5" />
          OAuth2
          {showRecommended && (
            <span className="absolute -top-2 -right-1 text-[8px] font-bold uppercase tracking-wider bg-green-500 text-white px-1.5 py-0.5 rounded-full shadow-sm">{t('onboarding.recommended')}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { if (!canManageConnection) return; updatePrimaryConnectionConfig({ authMethod: 'token' }); setConnectionTestResult(null); }}
          disabled={!canManageConnection}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${!isOAuth ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)]'} ${!canManageConnection ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Key className="w-3.5 h-3.5" />
          Token
        </button>
      </div>
    </div>
  );

  const updatePrimaryConnectionConfig = (patch = {}) => {
    setConfig((prev) => {
      const normalized = normalizeHaConfig(prev || {});
      const primaryId = normalized.primaryConnectionId || normalized.connections?.[0]?.id || 'primary';
      const nextConnections = normalized.connections.map((connection) => {
        if (connection.id !== primaryId) return connection;
        const nextAuthMethod = Object.prototype.hasOwnProperty.call(patch, 'authMethod')
          ? (patch.authMethod === 'token' ? 'token' : 'oauth')
          : connection.authMethod;
        const nextToken = Object.prototype.hasOwnProperty.call(patch, 'token')
          ? String(patch.token || '').trim()
          : connection.token;
        return {
          ...connection,
          ...patch,
          authMethod: nextAuthMethod,
          token: nextAuthMethod === 'token' ? nextToken : '',
        };
      });
      return normalizeHaConfig({
        ...normalized,
        ...patch,
        authMethod: patch.authMethod === 'token' ? 'token' : (patch.authMethod === 'oauth' ? 'oauth' : normalized.authMethod),
        token: patch.authMethod === 'oauth'
          ? ''
          : (Object.prototype.hasOwnProperty.call(patch, 'token') ? String(patch.token || '').trim() : normalized.token),
        connections: nextConnections,
        primaryConnectionId: primaryId,
      });
    });
  };

  const renderOAuthSection = () => {
    const oauthActive = hasOAuthTokens() && connected;
    const oauthConnecting = hasOAuthTokens() && !connected;
    return (
      <div className="space-y-4">
        {oauthConnecting ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="font-bold text-sm">{t('system.oauth.connecting')}</span>
          </div>
        ) : oauthActive ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20">
              <Check className="w-4 h-4" />
              <span className="font-bold text-sm">{t('system.oauth.authenticated')}</span>
            </div>
            <button
              type="button"
              onClick={handleOAuthLogout}
              disabled={!canManageConnection}
              className={`w-full py-2.5 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all ${!canManageConnection ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <LogOut className="w-4 h-4" />
              {t('system.oauth.logoutButton')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startOAuthLogin}
            disabled={!canManageConnection || !config.url || !validateUrl(config.url)}
            className={`w-full py-3 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${!config.url || !validateUrl(config.url) ? 'bg-[var(--glass-bg)] text-[var(--text-secondary)] opacity-50 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/20'}`}
          >
            <LogIn className="w-5 h-5" />
            {t('system.oauth.loginButton')}
          </button>
        )}
        {!config.url && (
          <p className="text-xs text-[var(--text-muted)] ml-1">{t('system.oauth.urlRequired')}</p>
        )}
        {!canManageConnection && (
          <p className="text-xs text-[var(--text-muted)] ml-1">Inspector role is view-only for connection settings.</p>
        )}
        {connectionTestResult && !connectionTestResult.success && isOAuth && (
          <div className="p-3 rounded-xl flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 animate-in fade-in slide-in-from-bottom-2">
            <X className="w-4 h-4 flex-shrink-0" />
            <span className="font-bold text-sm">{connectionTestResult.message}</span>
          </div>
        )}
      </div>
    );
  };

  const updateManagedConnection = (connectionId, updater) => {
    setManagedConnectionConfig((prev) => {
      const normalized = normalizeHaConfig(prev || {});
      const connections = normalized.connections.map((connection, index) => {
        if (connection.id !== connectionId) return connection;
        const nextConnection = typeof updater === 'function' ? updater(connection) : { ...connection, ...(updater || {}) };
        return normalizeConnection(nextConnection, index);
      });
      return normalizeHaConfig({
        ...normalized,
        connections,
        primaryConnectionId: normalized.primaryConnectionId,
      });
    });
  };

  const addManagedConnection = () => {
    const normalized = normalizeHaConfig(managedConnectionConfig || {});
    const nextId = normalizeConnectionId(`connection-${normalized.connections.length + 1}`);
    const nextState = normalizeHaConfig({
      ...normalized,
      connections: [
        ...normalized.connections,
        {
          id: nextId,
          name: `Connection ${normalized.connections.length + 1}`,
          url: '',
          fallbackUrl: '',
          authMethod: 'token',
          token: '',
          oauthTokens: null,
        },
      ],
    });
    setManagedConnectionConfig(nextState);
    setManagedConnectionId(nextState.connections[nextState.connections.length - 1]?.id || nextState.primaryConnectionId || 'primary');
  };

  const removeManagedConnection = () => {
    if (!selectedManagedConnection) return;
    const normalized = normalizeHaConfig(managedConnectionConfig || {});
    const filtered = normalized.connections.filter((connection) => connection.id !== selectedManagedConnection.id);
    if (!filtered.length) return;
    const nextPrimary = normalized.primaryConnectionId === selectedManagedConnection.id
      ? filtered[0].id
      : normalized.primaryConnectionId;
    const nextState = normalizeHaConfig({
      ...normalized,
      connections: filtered,
      primaryConnectionId: nextPrimary,
    });
    setManagedConnectionConfig(nextState);
    setManagedConnectionId(nextState.connections[0]?.id || nextState.primaryConnectionId || 'primary');
  };

  const setManagedPrimaryConnection = (connectionId) => {
    setManagedConnectionConfig((prev) => normalizeHaConfig({
      ...(prev || {}),
      primaryConnectionId: connectionId,
    }));
  };

  const handleSaveManagedConnection = async () => {
    if (!isPlatformAdmin || !connectionManageClientId || !userAdminApi?.saveClientHaConfig) return;
    setManagedConnectionSaving(true);
    try {
      const normalized = normalizeHaConfig(managedConnectionConfig || {});
      await userAdminApi.saveClientHaConfig(connectionManageClientId, {
        ...normalized,
        connections: normalized.connections.map((connection) => ({
          ...connection,
          id: normalizeConnectionId(connection.id),
          token: connection.authMethod === 'token' ? String(connection.token || '').trim() : '',
          url: String(connection.url || '').trim(),
          fallbackUrl: String(connection.fallbackUrl || '').trim(),
          authMethod: connection.authMethod === 'token' ? 'token' : 'oauth',
        })),
      });
      setGlobalActionMessage(`${t('connection.clientConfigSaved')}: ${connectionManageClientId}`);
    } catch (error) {
      setGlobalActionMessage(error?.message || t('connection.clientConfigSaveFailed'));
    } finally {
      setManagedConnectionSaving(false);
    }
  };

  const renderStorageTab = () => {
    const profiles = Array.isArray(globalDashboardProfiles) && globalDashboardProfiles.length > 0
      ? globalDashboardProfiles
      : [{ id: 'default', name: 'default', updatedAt: null }];
    const activeDashboardClientId = canManageClients
      ? String(selectedClientId || '').trim()
      : String(currentUser?.clientId || '').trim();
    const activeClientProfilesRaw = canManageClients
      ? (Array.isArray(dashboardProfilesByClient[activeDashboardClientId]) ? dashboardProfilesByClient[activeDashboardClientId] : [])
      : profiles;
    const activeClientProfiles = activeClientProfilesRaw.length > 0
      ? activeClientProfilesRaw
      : [{ id: 'default', name: 'default', updatedAt: null }];
    const getDashboardOptionsForClient = (clientId) => {
      const normalizedClientId = String(
        clientId || selectedClientId || currentUser?.clientId || ''
      ).trim();
      const baseProfiles = canManageClients
        ? (Array.isArray(dashboardProfilesByClient[normalizedClientId]) && dashboardProfilesByClient[normalizedClientId].length
            ? dashboardProfilesByClient[normalizedClientId]
            : [{ id: 'default', name: 'default', updatedAt: null }])
        : activeClientProfiles;
      const idSet = new Set([
        ...baseProfiles.map((profile) => String(profile?.id || '').trim()).filter(Boolean),
        ...users
          .filter((user) => (canManageClients ? String(user?.clientId || '').trim() === normalizedClientId : true))
          .map((user) => String(user?.assignedDashboardId || '').trim())
          .filter(Boolean),
      ]);
      if (!idSet.size) idSet.add('default');
      return Array.from(idSet).map((id) => {
        const existing = baseProfiles.find((profile) => String(profile?.id || '').trim() === id);
        return existing || { id, name: id, updatedAt: null };
      });
    };
    const dashboardOptions = getDashboardOptionsForClient(activeDashboardClientId || currentUser?.clientId);

    const roleLabel = (role) => t(`role.${role}`) || role;
    const i18nOrFallback = (key, fallback) => {
      const value = t(key);
      return value === key ? fallback : value;
    };
    const canImportExportDashboards = canManageAdministration;

    const syncUsers = (nextUsers) => {
      const normalized = Array.isArray(nextUsers) ? nextUsers : [];
      setUsers(normalized);
      setUserEdits((prev) => {
        const next = { ...prev };
        normalized.forEach((user) => {
          next[user.id] = {
            ...(next[user.id] || {}),
            ...buildUserEditState(user),
            password: next[user.id]?.password || '',
          };
        });
        return next;
      });
    };

    const syncClients = (nextClients) => {
      const normalized = Array.isArray(nextClients) ? nextClients : [];
      setClients(normalized);
      const existing = normalized.some((client) => client.id === selectedClientId);
      if (!existing) {
        setSelectedClientId(normalized[0]?.id || '');
      }
    };

    const storageTabs = [
      { key: 'users', label: t('userMgmt.tabUsers') },
      { key: 'dashboards', label: t('userMgmt.tabDashboards') },
      ...(canManageClients ? [{ key: 'clients', label: t('userMgmt.tabClients') }] : []),
    ];

    const refreshClients = async () => {
      if (!canManageClients) return;
      try {
        const list = await userAdminApi.listClients();
        syncClients(list);
      } catch (error) {
        if (error?.status !== 403) {
          setGlobalActionMessage(error?.message || 'Failed to load clients');
        }
      }
    };

    const handleRefresh = async () => {
      if (canManageClients && userAdminApi?.listClientDashboards) {
        const clientId = String(activeDashboardClientId || '').trim();
        if (clientId) {
          const list = await userAdminApi.listClientDashboards(clientId).catch(() => []);
          setDashboardProfilesByClient((prev) => ({ ...prev, [clientId]: Array.isArray(list) ? list : [] }));
          setGlobalActionMessage(`${t('userMgmt.refreshedDashboards')}: ${Array.isArray(list) ? list.length : 0}`);
        }
      } else if (refreshGlobalDashboards) {
        const nextProfiles = await refreshGlobalDashboards();
        if (Array.isArray(nextProfiles)) {
          setGlobalActionMessage(`${t('userMgmt.refreshedDashboards')}: ${nextProfiles.length}`);
        }
      }
      if (canManageAdministration && userAdminApi?.listUsers) {
        const list = await userAdminApi.listUsers().catch(() => []);
        syncUsers(list);
      }
      await refreshClients();
    };

    const handleCreateClient = async () => {
      if (!canManageClients || !userAdminApi?.createClient) return;
      const clientId = String(newClientId || '').trim();
      if (!clientId) {
        setGlobalActionMessage(t('userMgmt.clientIdRequired'));
        return;
      }
      try {
        const created = await userAdminApi.createClient(clientId, String(newClientName || '').trim());
        setNewClientId('');
        setNewClientName('');
        setShowCreateClientModal(false);
        await refreshClients();
        if (created?.id) {
          setSelectedClientId(created.id);
          setGlobalActionMessage(`${t('userMgmt.clientReady')}: ${created.id}`);
        }
      } catch (error) {
        setGlobalActionMessage(error?.message || t('userMgmt.createClientFailed'));
      }
    };

    const handleCreateClientAdmin = async () => {
      if (!canManageClients || !userAdminApi?.createClientAdmin) return;
      const clientId = String(selectedClientId || '').trim();
      const username = String(newClientAdminUsername || '').trim();
      const password = String(newClientAdminPassword || '').trim();
      if (!clientId || !username || !password) {
        setGlobalActionMessage(t('userMgmt.clientAdminRequired'));
        return;
      }
      try {
        await userAdminApi.createClientAdmin(clientId, username, password);
        setNewClientAdminUsername('');
        setNewClientAdminPassword('');
        setShowCreateClientAdminModal(false);
        await refreshClients();
        setGlobalActionMessage(`${t('userMgmt.clientAdminCreated')}: ${clientId}`);
      } catch (error) {
        setGlobalActionMessage(error?.message || t('userMgmt.createClientAdminFailed'));
      }
    };

    const openEditClient = (client) => {
      setEditClientId(client?.id || '');
      setEditClientName(client?.name || '');
      setShowEditClientModal(true);
    };

    const handleUpdateClient = async () => {
      if (!canManageClients || !userAdminApi?.updateClient) return;
      const clientId = String(editClientId || '').trim();
      const name = String(editClientName || '').trim();
      if (!clientId || !name) {
        setGlobalActionMessage(t('userMgmt.clientNameRequired'));
        return;
      }
      try {
        await userAdminApi.updateClient(clientId, name);
        setShowEditClientModal(false);
        await refreshClients();
        setGlobalActionMessage(`${t('userMgmt.clientUpdated')}: ${clientId}`);
      } catch (error) {
        setGlobalActionMessage(error?.message || t('userMgmt.updateClientFailed'));
      }
    };

    const openDeleteClient = (client) => {
      setDeleteClientId(client?.id || '');
      setDeleteClientConfirmText('');
      setShowDeleteClientModal(true);
    };

    const handleDeleteClient = async () => {
      if (!canManageClients || !userAdminApi?.deleteClient) return;
      const clientId = String(deleteClientId || '').trim();
      if (!clientId) return;
      if (deleteClientConfirmText.trim() !== 'OK') {
        setGlobalActionMessage(t('userMgmt.typeOkToDelete'));
        return;
      }
      try {
        await userAdminApi.deleteClient(clientId, 'OK');
        setShowDeleteClientModal(false);
        setDeleteClientId('');
        setDeleteClientConfirmText('');
        await refreshClients();
        setGlobalActionMessage(`${t('userMgmt.clientDeleted')}: ${clientId}`);
      } catch (error) {
        setGlobalActionMessage(error?.message || t('userMgmt.deleteClientFailed'));
      }
    };

    const handleSaveGlobal = async () => {
      if (!canEditDashboard) {
        setGlobalActionMessage(t('userMgmt.adminOnlySave'));
        return;
      }
      const target = newGlobalDashboardName.trim() || selectedGlobalDashboard || 'default';
      if (!saveGlobalDashboard) return;
        const ok = await saveGlobalDashboard(target);
        if (ok) {
          const canonicalId = String(target || 'default').trim().replace(/\s+/g, '_').toLowerCase();
        setGlobalActionMessage(`${t('userMgmt.savedGlobally')}: ${target}`);
        setSelectedGlobalDashboard(canonicalId);
        await refreshDashboardVersions();
      }
    };

    const handleLoadGlobal = async () => {
      const target = selectedGlobalDashboard || 'default';
      if (canManageClients && userAdminApi?.fetchClientDashboard) {
        const clientId = String(activeDashboardClientId || '').trim();
        if (!clientId) return;
        const data = await userAdminApi.fetchClientDashboard(clientId, target).catch(() => null);
        if (data && typeof data === 'object') {
          setGlobalActionMessage(`${t('userMgmt.loadedDashboard')}: ${target}`);
        } else {
          setGlobalActionMessage(t('userMgmt.loadDashboardFailed') || 'Could not load dashboard');
        }
        return;
      }
      if (!loadGlobalDashboard) return;
      const ok = await loadGlobalDashboard(target);
      if (ok) {
        setGlobalActionMessage(`${t('userMgmt.loadedDashboard')}: ${target}`);
      }
    };

    const handleRestoreDashboardVersion = async () => {
      const target = toProfileId(selectedGlobalDashboard || 'default');
      const versionId = String(selectedDashboardVersionId || '').trim();
      if (!versionId) {
        setGlobalActionMessage(i18nOrFallback('userMgmt.noDashboardVersionSelected', 'Select a dashboard version first'));
        return;
      }
      const selectedVersion = dashboardVersions.find((entry) => entry.id === versionId) || null;
      const versionLabel = selectedVersion?.createdAt
        ? new Date(selectedVersion.createdAt).toLocaleString()
        : versionId;
      const confirmMessage = `${i18nOrFallback('userMgmt.restoreDashboardVersionConfirm', 'Restore this dashboard version?')}\n${versionLabel}`;
      if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) return;

      setRestoringDashboardVersion(true);
      try {
        if (canManageClients && userAdminApi?.restoreClientDashboardVersion) {
          const clientId = String(activeDashboardClientId || '').trim();
          if (!clientId) {
            setGlobalActionMessage(t('userMgmt.clientIdRequired'));
            return;
          }
          await userAdminApi.restoreClientDashboardVersion(clientId, target, versionId);
          const list = await userAdminApi.listClientDashboards(clientId).catch(() => []);
          setDashboardProfilesByClient((prev) => ({ ...prev, [clientId]: Array.isArray(list) ? list : [] }));
        } else {
          await restoreSharedDashboardVersion(target, versionId);
          await loadGlobalDashboard?.(target);
        }

        await refreshDashboardVersions();
        setGlobalActionMessage(`${i18nOrFallback('userMgmt.restoredDashboardVersion', 'Restored dashboard version')}: ${versionLabel}`);
      } catch (error) {
        setGlobalActionMessage(error?.message || i18nOrFallback('userMgmt.restoreDashboardVersionFailed', 'Failed to restore dashboard version'));
      } finally {
        setRestoringDashboardVersion(false);
      }
    };

    const handleExportGlobal = async () => {
      const target = toProfileId(selectedGlobalDashboard || 'default');
      try {
        const data = canManageClients && userAdminApi?.fetchClientDashboard
          ? await userAdminApi.fetchClientDashboard(activeDashboardClientId, target)
          : await fetchSharedDashboardProfile(target);
        if (!data || typeof data !== 'object') {
          setGlobalActionMessage(t('userMgmt.exportFailed'));
          return;
        }
        const payload = {
          profileId: target,
          exportedAt: new Date().toISOString(),
          schemaVersion: 1,
          dashboard: data,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${target}-dashboard-export.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setGlobalActionMessage(`${t('userMgmt.exportedDashboard')}: ${target}`);
      } catch {
        setGlobalActionMessage(t('userMgmt.exportFailed'));
      }
    };

    const buildImportedDashboardMeta = (fileName, parsed) => {
      const rawName = String(parsed?.name || parsed?.profileId || fileName || 'dashboard').trim();
      const base = toProfileId(rawName.replace(/\.[^.]+$/, '') || 'dashboard');
      const now = new Date();
      const pad = (v) => String(v).padStart(2, '0');
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const stampId = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const id = toProfileId(`${base}_import_${stampId}`);
      const name = `${rawName.replace(/\.[^.]+$/, '')} import ${stamp}`;
      return { id, name };
    };

    const handleImportGlobal = async (event) => {
      const file = event?.target?.files?.[0];
      event.target.value = '';
      if (!file || importingDashboard) return;
      setImportingDashboard(true);
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const importedDashboard = parsed?.dashboard && typeof parsed.dashboard === 'object'
          ? parsed.dashboard
          : (parsed && typeof parsed === 'object' ? parsed : null);

        if (!importedDashboard || typeof importedDashboard !== 'object') {
          setGlobalActionMessage(t('userMgmt.importInvalidFile'));
          return;
        }

        const importedMeta = buildImportedDashboardMeta(file?.name, parsed);
        const target = importedMeta.id;
        const targetName = importedMeta.name;

        if (canManageClients && userAdminApi?.saveClientDashboard) {
          const clientId = String(activeDashboardClientId || '').trim();
          if (!clientId) {
            setGlobalActionMessage(t('userMgmt.clientIdRequired'));
            return;
          }
          await userAdminApi.saveClientDashboard(clientId, target, targetName, importedDashboard);
          const next = await userAdminApi.listClientDashboards(clientId).catch(() => []);
          setDashboardProfilesByClient((prev) => {
            const current = Array.isArray(prev[clientId]) ? prev[clientId] : [];
            if (!Array.isArray(next)) return prev;
            if (next.length === 0 && current.length > 0) return prev;
            return { ...prev, [clientId]: next };
          });
        } else {
          await saveSharedDashboardProfile(target, importedDashboard);
          await refreshGlobalDashboards?.();
          await loadGlobalDashboard?.(target);
        }
        setSelectedGlobalDashboard(target);
        setGlobalActionMessage(`${t('userMgmt.importedDashboard')}: ${targetName}`);
      } catch {
        setGlobalActionMessage(t('userMgmt.importFailed'));
      } finally {
        setImportingDashboard(false);
      }
    };

    const handleAssignSelectedDashboard = async () => {
      if (!canManageAdministration || !userAdminApi?.updateUser) return;
      const userId = String(assignTargetUserId || '').trim();
      const dashboardId = String(selectedGlobalDashboard || '').trim();
      if (!userId || !dashboardId) {
        setGlobalActionMessage(i18nOrFallback('userMgmt.assignTargetRequired', 'Select both dashboard and user'));
        return;
      }
      const targetUser = users.find((user) => user.id === userId);
      const targetClientId = String(targetUser?.clientId || currentUser?.clientId || '').trim();
      const validOptions = getDashboardOptionsForClient(targetClientId).map((entry) => String(entry?.id || '').trim());
      if (!validOptions.includes(dashboardId)) {
        setGlobalActionMessage(i18nOrFallback('userMgmt.dashboardNotAvailableForClient', 'Selected dashboard is not available for that client'));
        return;
      }
      try {
        const updated = await userAdminApi.updateUser(userId, { assignedDashboardId: dashboardId });
        if (updated?.id) {
          setUsers((prev) => prev.map((user) => (user.id === updated.id ? updated : user)));
          setUserEdits((prev) => ({
            ...prev,
            [updated.id]: {
              ...(prev[updated.id] || {}),
              ...buildUserEditState(updated),
              password: '',
            },
          }));
        }
        setGlobalActionMessage(`${i18nOrFallback('userMgmt.assignedDashboard', 'Assigned dashboard')}: ${dashboardId}`);
      } catch (error) {
        setGlobalActionMessage(error?.message || i18nOrFallback('userMgmt.assignDashboardFailed', 'Failed to assign dashboard'));
      }
    };

    const handleCreateUser = async () => {
      if (!canManageAdministration || !userAdminApi?.createUser) return;
      const username = newUsername.trim();
      const password = newPassword.trim();
      const targetClientId = canManageClients ? String(newUserClientId || '').trim() : (currentUser?.clientId || '');
      if (!username || !password) {
        setGlobalActionMessage(t('userMgmt.usernamePasswordRequired'));
        return;
      }
      if (!targetClientId) {
        setGlobalActionMessage(t('userMgmt.clientIdRequired'));
        return;
      }
      try {
        const createdUser = await userAdminApi.createUser({
          clientId: targetClientId,
          username,
          password,
          role: newRole,
          assignedDashboardId: newUserDashboard || 'default',
          haUrl: newUserHaUrl.trim(),
          haToken: newUserHaToken.trim(),
          phoneCountryCode: String(newUserPhoneCountryCode || '+47').trim() || '+47',
          phone: String(newUserPhone || '').trim(),
        });
        setNewUsername('');
        setNewPassword('');
        setNewUserClientId(currentUser?.clientId || clients[0]?.id || '');
        setNewUserHaUrl('');
        setNewUserHaToken('');
        setNewUserPhoneCountryCode('+47');
        setNewUserPhone('');
        setShowCreateUserModal(false);
        const list = targetClientId === (currentUser?.clientId || '')
          ? await userAdminApi.listUsers().catch(() => null)
          : null;
        if (Array.isArray(list)) {
          syncUsers(list);
        } else if (createdUser) {
          const nextUsers = ((prev) => {
            const next = Array.isArray(prev) ? prev.slice() : [];
            const idx = next.findIndex((u) => u.id === createdUser.id);
            if (idx === -1) next.push(createdUser);
            else next[idx] = createdUser;
            return next.sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
          })(users);
          syncUsers(nextUsers);
        }
        setGlobalActionMessage(`${t('userMgmt.createdUser')}: ${username} (${targetClientId})`);
      } catch (error) {
        setGlobalActionMessage(error?.message || t('userMgmt.createUserFailed'));
      }
    };

    const updateUserEdit = (id, patch) => {
      setUserEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
    };

    const openEditUser = async (user) => {
      const clientId = String(
        user?.clientId || selectedClientId || currentUser?.clientId || ''
      ).trim();
      let fetchedOptions = [];
      if (canManageClients && clientId && userAdminApi?.listClientDashboards) {
        try {
          const dashboards = await userAdminApi.listClientDashboards(clientId);
          fetchedOptions = Array.isArray(dashboards) ? dashboards : [];
          setDashboardProfilesByClient((prev) => ({
            ...prev,
            [clientId]: Array.isArray(dashboards)
              ? ((dashboards.length === 0 && Array.isArray(prev[clientId]) && prev[clientId].length > 0)
                  ? prev[clientId]
                  : dashboards)
              : (prev[clientId] || []),
          }));
        } catch {
          // best-effort, keep existing options
        }
      }
      const fallbackOptions = getDashboardOptionsForClient(clientId);
      const currentAssigned = String(user?.assignedDashboardId || 'default').trim() || 'default';
      const merged = (fetchedOptions.length ? fetchedOptions : fallbackOptions).map((entry) => ({
        id: String(entry?.id || '').trim(),
        name: String(entry?.name || entry?.id || '').trim(),
        updatedAt: entry?.updatedAt || null,
      })).filter((entry) => entry.id);
      const hasAssigned = merged.some((entry) => entry.id === currentAssigned);
      if (!hasAssigned) merged.push({ id: currentAssigned, name: currentAssigned, updatedAt: null });
      if (!merged.length) merged.push({ id: 'default', name: 'default', updatedAt: null });
      setEditUserDashboardOptions(merged);
      setEditingUserId(user?.id || '');
      setShowEditUserModal(true);
    };

    const handleSaveUser = async (userId) => {
      if (!userAdminApi?.updateUser) return;
      const draft = userEdits[userId];
      if (!draft) return;
      setSavingUserIds((prev) => ({ ...prev, [userId]: true }));
      try {
        const updated = await userAdminApi.updateUser(userId, {
          username: String(draft.username || '').trim(),
          role: normalizeRole(draft.role),
          assignedDashboardId: String(draft.assignedDashboardId || 'default').trim() || 'default',
          haUrl: String(draft.haUrl || '').trim(),
          haToken: String(draft.haToken || '').trim(),
          phoneCountryCode: String(draft.phoneCountryCode || '+47').trim() || '+47',
          phone: String(draft.phone || '').trim(),
          password: String(draft.password || '').trim(),
        });
        setUsers((prev) => prev.map((user) => (user.id === userId ? updated : user)));
        setUserEdits((prev) => ({ ...prev, [userId]: { ...buildUserEditState(updated), password: '' } }));
        setGlobalActionMessage(`${t('userMgmt.savedUser')}: ${updated?.username || userId}`);
      } catch (error) {
        setGlobalActionMessage(error?.message || t('userMgmt.saveUserFailed'));
      } finally {
        setSavingUserIds((prev) => ({ ...prev, [userId]: false }));
      }
    };

    const handleDeleteUser = async (userId) => {
      if (!userAdminApi?.deleteUser) return;
      setDeletingUserIds((prev) => ({ ...prev, [userId]: true }));
      try {
        await userAdminApi.deleteUser(userId);
        setUsers((prev) => prev.filter((user) => user.id !== userId));
        setUserEdits((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        setGlobalActionMessage(t('userMgmt.userDeleted'));
      } catch (error) {
        setGlobalActionMessage(error?.message || t('userMgmt.deleteUserFailed'));
      } finally {
        setDeletingUserIds((prev) => ({ ...prev, [userId]: false }));
      }
    };

    return (
      <div className="space-y-5 font-sans animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="rounded-2xl p-5 bg-[var(--glass-bg)] border border-[var(--glass-border)] space-y-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
                {t('userMgmt.title')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {t('userMgmt.dashboardUser')}: {currentUser?.username || '-'} ({roleLabel(currentUser?.role || 'user')})
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                disabled={globalStorageBusy}
                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-[var(--glass-bg-hover)] hover:bg-[var(--glass-bg)] text-[var(--text-primary)] border border-[var(--glass-border)] disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 inline mr-1 ${globalStorageBusy ? 'animate-spin' : ''}`} />
                {t('common.refresh')}
              </button>
              <button
                onClick={onLogout}
                className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
              >
                {t('common.logout')}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] p-1 flex gap-1">
            {storageTabs.map((tab) => {
              const active = storageSection === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStorageSection(tab.key)}
                  className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                    active
                      ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {storageSection === 'clients' && canManageClients && (
            <div className="space-y-3 pt-2 border-t border-[var(--glass-border)]">
              <h4 className="text-xs uppercase font-bold tracking-wider text-[var(--text-secondary)]">{t('userMgmt.clientManagement')}</h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => setShowCreateClientModal(true)}
                  className="w-full py-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold uppercase tracking-wider shadow-lg shadow-indigo-500/20"
                >
                  {t('userMgmt.createNewClient')}
                </button>
                <button
                  onClick={() => setShowCreateClientAdminModal(true)}
                  className="w-full py-4 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold uppercase tracking-wider shadow-lg shadow-green-500/20"
                >
                  {t('userMgmt.createClientAdmin')}
                </button>
              </div>

              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.existingClients')}</p>
                  <span className="text-[10px] text-[var(--text-secondary)]">{clients.length} {t('userMgmt.total')}</span>
                </div>
                <div className="space-y-2 max-h-[26rem] overflow-auto pr-1">
                  {clients.map((client) => (
                    <div key={client.id} className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2 space-y-2">
                      <div>
                        <p className="text-sm font-semibold truncate">{client.name || client.id}</p>
                        <p className="text-[11px] text-[var(--text-secondary)] truncate">
                          ID: {client.id} • {t('userMgmt.usersCount')}: {client.userCount || 0} • {t('role.admin')}: {client.adminCount || 0}
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditClient(client)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[11px] font-bold uppercase tracking-wider hover:bg-[var(--glass-bg-hover)]"
                        >
                          {t('menu.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteClient(client)}
                          className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-bold uppercase tracking-wider hover:bg-red-500/20"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {storageSection === 'dashboards' && (
            <>
              {canManageClients && (
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-[var(--text-secondary)]">{t('userMgmt.selectClient')}</label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)]"
                  >
                    <option value="">{t('userMgmt.selectClient')}</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name || client.id} ({client.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-[var(--text-secondary)]">{t('userMgmt.loadDashboard')}</label>
                <select
                  value={selectedGlobalDashboard}
                  onChange={(e) => setSelectedGlobalDashboard(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)]"
                >
                  {dashboardOptions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name || profile.id}{profile.updatedAt ? ` (${new Date(profile.updatedAt).toLocaleString()})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLoadGlobal}
                  disabled={globalStorageBusy}
                  className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {globalStorageBusy ? t('common.loading') : t('userMgmt.loadDashboard')}
                </button>
                <div className="space-y-2 pt-1">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                    {i18nOrFallback('userMgmt.dashboardHistory', 'Dashboard history')}
                  </label>
                  <select
                    value={selectedDashboardVersionId}
                    onChange={(e) => setSelectedDashboardVersionId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)]"
                    disabled={loadingDashboardVersions || restoringDashboardVersion}
                  >
                    {dashboardVersions.length === 0 ? (
                      <option value="">
                        {loadingDashboardVersions
                          ? i18nOrFallback('common.loading', 'Loading...')
                          : i18nOrFallback('userMgmt.noDashboardHistory', 'No history available')}
                      </option>
                    ) : (
                      dashboardVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {(version.createdAt ? new Date(version.createdAt).toLocaleString() : version.id)}
                          {version.sourceUpdatedAt ? ` - ${i18nOrFallback('userMgmt.from', 'from')} ${new Date(version.sourceUpdatedAt).toLocaleString()}` : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={refreshDashboardVersions}
                      disabled={loadingDashboardVersions || restoringDashboardVersion}
                      className="py-2.5 rounded-xl bg-[var(--glass-bg-hover)] hover:bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      {loadingDashboardVersions ? i18nOrFallback('common.loading', 'Loading...') : i18nOrFallback('common.refresh', 'Refresh')}
                    </button>
                    <button
                      onClick={handleRestoreDashboardVersion}
                      disabled={!selectedDashboardVersionId || loadingDashboardVersions || restoringDashboardVersion}
                      className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      {restoringDashboardVersion
                        ? i18nOrFallback('common.loading', 'Loading...')
                        : i18nOrFallback('userMgmt.restoreVersion', 'Restore')}
                    </button>
                  </div>
                </div>
                {canImportExportDashboards && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={handleExportGlobal}
                      disabled={globalStorageBusy || importingDashboard}
                      className="py-2.5 rounded-xl bg-[var(--glass-bg-hover)] hover:bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      {t('userMgmt.exportDashboard')}
                    </button>
                    <label className="py-2.5 rounded-xl bg-[var(--glass-bg-hover)] hover:bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider text-center cursor-pointer disabled:opacity-50">
                      <input
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={handleImportGlobal}
                        disabled={globalStorageBusy || importingDashboard}
                      />
                      {importingDashboard ? t('common.loading') : t('userMgmt.importDashboard')}
                    </label>
                  </div>
                )}
              </div>

              {canManageAdministration && (
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-[var(--text-secondary)]">
                    {i18nOrFallback('userMgmt.assignDashboardToUser', 'Assign selected dashboard to user')}
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                    <select
                      value={assignTargetUserId}
                      onChange={(e) => setAssignTargetUserId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)]"
                    >
                      <option value="">{i18nOrFallback('userMgmt.selectUser', 'Select user')}</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.username} ({user.clientId || currentUser?.clientId || '-'})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssignSelectedDashboard}
                      disabled={!assignTargetUserId || !selectedGlobalDashboard}
                      className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      {i18nOrFallback('userMgmt.assignNow', 'Assign now')}
                    </button>
                  </div>
                </div>
              )}

              {canEditDashboard && (
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-[var(--text-secondary)]">{t('userMgmt.saveGlobally')}</label>
                  <input
                    type="text"
                    value={newGlobalDashboardName}
                    onChange={(e) => setNewGlobalDashboardName(e.target.value)}
                    placeholder="default"
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)]"
                  />
                  <button
                    onClick={handleSaveGlobal}
                    disabled={globalStorageBusy}
                    className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                  >
                    {globalStorageBusy ? t('common.saving') : t('userMgmt.saveGlobally')}
                  </button>
                </div>
              )}
            </>
          )}

          {storageSection === 'users' && canManageAdministration && (
            <div className="space-y-3 pt-2 border-t border-[var(--glass-border)]">
              <h4 className="text-xs uppercase font-bold tracking-wider text-[var(--text-secondary)]">{t('userMgmt.userAccounts')}</h4>

              <button
                onClick={() => setShowCreateUserModal(true)}
                className="w-full py-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold uppercase tracking-wider shadow-lg shadow-indigo-500/20"
              >
                {t('userMgmt.createNewUser')}
              </button>

              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.existingUsers')}</p>
                  <span className="text-[10px] text-[var(--text-secondary)]">{users.length} {t('userMgmt.total')}</span>
                </div>
                <div className="space-y-2 max-h-[26rem] overflow-auto pr-1">
                  {users.map((u) => {
                    return (
                      <div key={u.id} className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2 space-y-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{u.username}</p>
                          <p className="text-[11px] text-[var(--text-secondary)] truncate">{t('userMgmt.role')}: {roleLabel(u.role)} • {t('userMgmt.dashboard')}: {u.assignedDashboardId || 'default'} • {t('userMgmt.client')}: {u.clientId || currentUser?.clientId || '-'}</p>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] truncate">ID: {u.id}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditUser(u)}
                              className="px-3 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[11px] font-bold uppercase tracking-wider hover:bg-[var(--glass-bg-hover)]"
                            >
                              {t('menu.edit')}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              disabled={!!deletingUserIds[u.id] || u.id === currentUser?.id}
                              className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-bold uppercase tracking-wider disabled:opacity-40"
                            >
                              {deletingUserIds[u.id] ? t('common.deleting') : t('common.delete')}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {showCreateUserModal && (
            <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreateUserModal(false)}>
              <div className="w-full max-w-2xl rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider">{t('userMgmt.createNewUser')}</h4>
                  <button onClick={() => setShowCreateUserModal(false)} className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)]"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.client')}</label>
                    {canManageClients ? (
                      <select
                        value={newUserClientId}
                        onChange={(e) => setNewUserClientId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                      >
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>{client.name || client.id} ({client.id})</option>
                        ))}
                      </select>
                    ) : (
                      <input value={currentUser?.clientId || '-'} readOnly className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm opacity-80" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('profile.username')}</label>
                    <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder={t('profile.username')} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.password')}</label>
                    <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder={t('userMgmt.password')} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.role')}</label>
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm">
                      <option value="user">{roleLabel('user')}</option>
                      <option value="admin">{roleLabel('admin')}</option>
                      <option value="inspector">{roleLabel('inspector')}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.dashboard')}</label>
                    <select value={newUserDashboard} onChange={(e) => setNewUserDashboard(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm">
                      {getDashboardOptionsForClient(canManageClients ? newUserClientId : currentUser?.clientId).map((profile) => (
                        <option key={profile.id} value={profile.id}>{profile.name || profile.id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">Country code</label>
                    <input
                      value={newUserPhoneCountryCode}
                      onChange={(e) => setNewUserPhoneCountryCode(e.target.value)}
                      placeholder="+47"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('profile.phone')}</label>
                    <input
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="99999999"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.haUrlOptional')}</label>
                    <input value={newUserHaUrl} onChange={(e) => setNewUserHaUrl(e.target.value)} placeholder={t('userMgmt.haUrlOptional')} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.haTokenOptional')}</label>
                    <input value={newUserHaToken} onChange={(e) => setNewUserHaToken(e.target.value)} placeholder={t('userMgmt.haTokenOptional')} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCreateUserModal(false)} className="px-4 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-xs font-bold uppercase tracking-wider">{t('common.cancel')}</button>
                  <button onClick={handleCreateUser} className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider">{t('common.save')}</button>
                </div>
              </div>
            </div>
          )}

          {showEditUserModal && editingUserId && (
            <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowEditUserModal(false); setEditingUserId(''); setEditUserDashboardOptions([]); }}>
              <div className="w-full max-w-2xl rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider">{t('menu.edit')} {t('userMgmt.userAccounts')}</h4>
                  <button onClick={() => { setShowEditUserModal(false); setEditingUserId(''); setEditUserDashboardOptions([]); }} className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)]"><X className="w-4 h-4" /></button>
                </div>
                {(() => {
                  const u = users.find((user) => user.id === editingUserId);
                  if (!u) return <p className="text-sm text-[var(--text-secondary)]">User not found.</p>;
                  return (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.client')}</label>
                          <input value={u.clientId || currentUser?.clientId || '-'} readOnly className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm opacity-80" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('profile.username')}</label>
                          <input
                            value={userEdits[u.id]?.username ?? ''}
                            onChange={(e) => updateUserEdit(u.id, { username: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                            placeholder={t('profile.username')}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.newPasswordOptional')}</label>
                          <input
                            value={userEdits[u.id]?.password ?? ''}
                            onChange={(e) => updateUserEdit(u.id, { password: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                            type="password"
                            placeholder={t('userMgmt.newPasswordOptional')}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.role')}</label>
                          <select
                            value={userEdits[u.id]?.role ?? 'user'}
                            onChange={(e) => updateUserEdit(u.id, { role: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                          >
                            <option value="user">{roleLabel('user')}</option>
                            <option value="admin">{roleLabel('admin')}</option>
                            <option value="inspector">{roleLabel('inspector')}</option>
                          </select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.dashboard')}</label>
                          <select
                            value={userEdits[u.id]?.assignedDashboardId ?? 'default'}
                            onChange={(e) => updateUserEdit(u.id, { assignedDashboardId: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                          >
                            {(editUserDashboardOptions.length ? editUserDashboardOptions : getDashboardOptionsForClient(canManageClients ? (u.clientId || selectedClientId) : currentUser?.clientId)).map((profile) => (
                              <option key={profile.id} value={profile.id}>{profile.name || profile.id}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">Country code</label>
                          <input
                            value={userEdits[u.id]?.phoneCountryCode ?? '+47'}
                            onChange={(e) => updateUserEdit(u.id, { phoneCountryCode: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                            placeholder="+47"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('profile.phone')}</label>
                          <input
                            value={userEdits[u.id]?.phone ?? ''}
                            onChange={(e) => updateUserEdit(u.id, { phone: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                            placeholder="99999999"
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.haUrlOptional')}</label>
                          <input
                            value={userEdits[u.id]?.haUrl ?? ''}
                            onChange={(e) => updateUserEdit(u.id, { haUrl: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                            placeholder={t('userMgmt.haUrlOptional')}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.haTokenOptional')}</label>
                          <input
                            value={userEdits[u.id]?.haToken ?? ''}
                            onChange={(e) => updateUserEdit(u.id, { haToken: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                            placeholder={t('userMgmt.haTokenOptional')}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowEditUserModal(false); setEditingUserId(''); setEditUserDashboardOptions([]); }} className="px-4 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-xs font-bold uppercase tracking-wider">{t('common.cancel')}</button>
                        <button
                          onClick={async () => {
                            await handleSaveUser(u.id);
                            setShowEditUserModal(false);
                            setEditingUserId('');
                            setEditUserDashboardOptions([]);
                          }}
                          disabled={!!savingUserIds[u.id]}
                          className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                        >
                          {savingUserIds[u.id] ? t('common.saving') : t('common.save')}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {showCreateClientModal && (
            <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreateClientModal(false)}>
              <div className="w-full max-w-lg rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider">{t('userMgmt.createNewClient')}</h4>
                  <button onClick={() => setShowCreateClientModal(false)} className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)]"><X className="w-4 h-4" /></button>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.clientId')}</label>
                    <input value={newClientId} onChange={(e) => setNewClientId(e.target.value)} placeholder={t('userMgmt.clientId')} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.clientNameOptional')}</label>
                    <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder={t('userMgmt.clientNameOptional')} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCreateClientModal(false)} className="px-4 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-xs font-bold uppercase tracking-wider">{t('common.cancel')}</button>
                  <button onClick={handleCreateClient} className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider">{t('common.save')}</button>
                </div>
              </div>
            </div>
          )}

          {showCreateClientAdminModal && (
            <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCreateClientAdminModal(false)}>
              <div className="w-full max-w-2xl rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider">{t('userMgmt.createClientAdmin')}</h4>
                  <button onClick={() => setShowCreateClientAdminModal(false)} className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)]"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.selectClient')}</label>
                    <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm">
                      <option value="">{t('userMgmt.selectClient')}</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.id} ({client.userCount || 0} users)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('profile.username')}</label>
                    <input value={newClientAdminUsername} onChange={(e) => setNewClientAdminUsername(e.target.value)} placeholder={t('profile.username')} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.password')}</label>
                    <input value={newClientAdminPassword} onChange={(e) => setNewClientAdminPassword(e.target.value)} type="password" placeholder={t('userMgmt.password')} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCreateClientAdminModal(false)} className="px-4 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-xs font-bold uppercase tracking-wider">{t('common.cancel')}</button>
                  <button onClick={handleCreateClientAdmin} className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-bold uppercase tracking-wider">{t('common.save')}</button>
                </div>
              </div>
            </div>
          )}

          {showEditClientModal && (
            <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEditClientModal(false)}>
              <div className="w-full max-w-lg rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider">{t('userMgmt.editClient')}</h4>
                  <button onClick={() => setShowEditClientModal(false)} className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)]"><X className="w-4 h-4" /></button>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.clientId')}</label>
                    <input value={editClientId} readOnly className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm opacity-80" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.clientNameOptional')}</label>
                    <input value={editClientName} onChange={(e) => setEditClientName(e.target.value)} placeholder={t('userMgmt.clientNameOptional')} className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowEditClientModal(false)} className="px-4 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-xs font-bold uppercase tracking-wider">{t('common.cancel')}</button>
                  <button onClick={handleUpdateClient} className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider">{t('common.save')}</button>
                </div>
              </div>
            </div>
          )}

          {showDeleteClientModal && (
            <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowDeleteClientModal(false)}>
              <div className="w-full max-w-lg rounded-2xl border border-[var(--glass-border)] bg-[var(--card-bg)] p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-red-300">{t('userMgmt.deleteClient')}</h4>
                  <button onClick={() => setShowDeleteClientModal(false)} className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)]"><X className="w-4 h-4" /></button>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  {t('userMgmt.deleteClientWarning')} <span className="font-semibold text-[var(--text-primary)]">{deleteClientId}</span>
                </p>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{t('userMgmt.typeOkPrompt')}</label>
                  <input
                    value={deleteClientConfirmText}
                    onChange={(e) => setDeleteClientConfirmText(e.target.value)}
                    placeholder="OK"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowDeleteClientModal(false)} className="px-4 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-xs font-bold uppercase tracking-wider">{t('common.cancel')}</button>
                  <button onClick={handleDeleteClient} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider">{t('common.delete')}</button>
                </div>
              </div>
            </div>
          )}

          {(globalStorageError || globalActionMessage) && (
            <div className={`rounded-xl p-3 text-xs font-semibold ${globalStorageError ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
              {globalStorageError || globalActionMessage}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Connection Tab ───
  const renderConnectionTab = () => (
    <div className="space-y-6 font-sans animate-in fade-in slide-in-from-right-4 duration-300">
      {isPlatformAdmin && (
        <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs uppercase tracking-wider font-bold text-[var(--text-secondary)]">{t('connection.clientManager')}</h4>
            <span className="text-[11px] text-[var(--text-secondary)]">
              {t('connection.editingClient')}: <strong className="text-[var(--text-primary)]">{selectedManagedClient?.name || connectionManageClientId || '-'}</strong>
            </span>
          </div>
          <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{selectedManagedClient?.name || '-'}</span>
            <span className="mx-2 text-[var(--text-muted)]">•</span>
            <span>{selectedManagedClient?.id || '-'}</span>
            <span className="mx-2 text-[var(--text-muted)]">•</span>
            <span>{t('connection.selectedClientOnly')}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{t('userMgmt.selectClient')}</label>
              <select
                value={connectionManageClientId}
                onChange={(e) => setConnectionManageClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name || client.id} ({client.id})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">Connection</label>
              <select
                value={selectedManagedConnection?.id || ''}
                onChange={(e) => setManagedConnectionId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
              >
                {managedConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name || connection.id} ({connection.id}){connection.id === managedConnectionConfig.primaryConnectionId ? ' • Primary' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addManagedConnection}
                className="px-3 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[11px] font-bold uppercase tracking-wider"
              >
                Add connection
              </button>
              <button
                type="button"
                onClick={removeManagedConnection}
                disabled={!selectedManagedConnection || managedConnections.length <= 1}
                className="px-3 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[11px] font-bold uppercase tracking-wider disabled:opacity-50"
              >
                Remove selected
              </button>
              <button
                type="button"
                onClick={() => setManagedPrimaryConnection(selectedManagedConnection?.id)}
                disabled={!selectedManagedConnection || selectedManagedConnection.id === managedConnectionConfig.primaryConnectionId}
                className="px-3 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[11px] font-bold uppercase tracking-wider disabled:opacity-50"
              >
                Set as primary
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">Connection ID</label>
              <input
                value={selectedManagedConnection?.id || ''}
                onChange={(e) => {
                  const nextId = normalizeConnectionId(e.target.value, selectedManagedConnection?.id || 'primary');
                  if (!selectedManagedConnection) return;
                  updateManagedConnection(selectedManagedConnection.id, { ...selectedManagedConnection, id: nextId });
                  setManagedConnectionId(nextId);
                  if (managedConnectionConfig.primaryConnectionId === selectedManagedConnection.id) {
                    setManagedPrimaryConnection(nextId);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                placeholder="primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">Connection name</label>
              <input
                value={selectedManagedConnection?.name || ''}
                onChange={(e) => {
                  if (!selectedManagedConnection) return;
                  updateManagedConnection(selectedManagedConnection.id, { ...selectedManagedConnection, name: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                placeholder="Main / Sauna 2 / Building B"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{t('system.authMethod')}</label>
              <select
                value={selectedManagedConnection?.authMethod || 'oauth'}
                onChange={(e) => {
                  if (!selectedManagedConnection) return;
                  const nextAuthMethod = e.target.value === 'token' ? 'token' : 'oauth';
                  updateManagedConnection(selectedManagedConnection.id, {
                    ...selectedManagedConnection,
                    authMethod: nextAuthMethod,
                    token: nextAuthMethod === 'token' ? selectedManagedConnection.token : '',
                    oauthTokens: nextAuthMethod === 'oauth' ? selectedManagedConnection.oauthTokens : null,
                  });
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
              >
                <option value="oauth">OAuth2</option>
                <option value="token">Token</option>
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{t('system.haUrlPrimary')}</label>
              <input
                value={selectedManagedConnection?.url || ''}
                onChange={(e) => {
                  if (!selectedManagedConnection) return;
                  updateManagedConnection(selectedManagedConnection.id, { ...selectedManagedConnection, url: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                placeholder="https://homeassistant.local:8123"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{t('system.haUrlFallback')}</label>
              <input
                value={selectedManagedConnection?.fallbackUrl || ''}
                onChange={(e) => {
                  if (!selectedManagedConnection) return;
                  updateManagedConnection(selectedManagedConnection.id, { ...selectedManagedConnection, fallbackUrl: e.target.value });
                }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                placeholder={t('common.optional')}
              />
            </div>
            {selectedManagedConnection?.authMethod === 'token' && (
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">{t('system.token')}</label>
                <textarea
                  value={selectedManagedConnection?.token || ''}
                  onChange={(e) => {
                    if (!selectedManagedConnection) return;
                    updateManagedConnection(selectedManagedConnection.id, { ...selectedManagedConnection, token: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm h-24 resize-none font-mono"
                  placeholder="ey..."
                />
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveManagedConnection}
              disabled={managedConnectionLoading || managedConnectionSaving || !connectionManageClientId}
              className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {managedConnectionSaving ? t('common.saving') : t('connection.saveClientConfig')}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
        <p className="text-[11px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
          {t('connection.sessionInfo')}: <span className="text-[var(--text-primary)]">{currentUser?.clientId || '-'}</span>
        </p>
      </div>

      {!isPlatformAdmin && (
        <>
          {/* Auth Method Toggle */}
          {renderAuthMethodToggle()}

          {/* URL — always shown */}
          <div className="space-y-3">
            <label className="text-xs uppercase font-bold text-gray-500 ml-1 flex items-center gap-2">
              <Wifi className="w-4 h-4" />
              {t('system.haUrlPrimary')}
              {connected && activeUrl === config.url && <span className="text-green-400 bg-green-500/10 px-2 py-0.5 rounded text-[10px] tracking-widest">{t('system.connected')}</span>}
            </label>
            <div className="relative group">
              <input
                type="text"
                className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:bg-[var(--glass-bg-hover)] focus:border-blue-500/50 outline-none transition-all placeholder:text-[var(--text-muted)]"
                value={config.url}
                disabled={!canManageConnection}
                onChange={(e) => updatePrimaryConnectionConfig({ url: e.target.value.trim() })}
                placeholder="https://homeassistant.local:8123"
              />
              <div className="absolute inset-0 rounded-xl bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
            {config.url && config.url.endsWith('/') && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs font-bold border border-yellow-500/20">
                <AlertCircle className="w-3 h-3" />
                {t('onboarding.urlTrailingSlash')}
              </div>
            )}
          </div>

          {/* OAuth2 mode — login button */}
          {isOAuth && renderOAuthSection()}

          {/* Token mode — fallback URL + token */}
          {!isOAuth && (
            <>
              <div className="space-y-3">
                <label className="text-xs uppercase font-bold text-gray-500 ml-1 flex items-center gap-2">
                  <Server className="w-4 h-4" />
                  {t('system.haUrlFallback')}
                  {connected && activeUrl === config.fallbackUrl && <span className="text-green-400 bg-green-500/10 px-2 py-0.5 rounded text-[10px] tracking-widest">{t('system.connected')}</span>}
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:bg-[var(--glass-bg-hover)] focus:border-blue-500/50 outline-none transition-all placeholder:text-[var(--text-muted)]"
                    value={config.fallbackUrl}
                    disabled={!canManageConnection}
                    onChange={(e) => updatePrimaryConnectionConfig({ fallbackUrl: e.target.value.trim() })}
                    placeholder={t('common.optional')}
                  />
                  <div className="absolute inset-0 rounded-xl bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
                {config.fallbackUrl && config.fallbackUrl.endsWith('/') && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 text-xs font-bold border border-yellow-500/20">
                    <AlertCircle className="w-3 h-3" />
                    {t('onboarding.urlTrailingSlash')}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-xs uppercase font-bold text-gray-500 ml-1 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  {t('system.token')}
                </label>
                <div className="relative group">
                  <textarea
                    className="w-full px-4 py-3 h-32 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:bg-[var(--glass-bg-hover)] focus:border-blue-500/50 outline-none transition-all font-mono text-xs leading-relaxed resize-none"
                    value={config.token}
                    disabled={!canManageConnection}
                    onChange={(e) => updatePrimaryConnectionConfig({ token: e.target.value.trim() })}
                    placeholder="ey..."
                  />
                  <div className="absolute inset-0 rounded-xl bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  const updateNotificationDraft = (updater) => {
    setNotificationDraft((prev) => {
      const base = normalizeNotificationConfig(prev || DEFAULT_NOTIFICATION_CONFIG);
      const next = typeof updater === 'function' ? updater(base) : { ...base, ...(updater || {}) };
      setNotificationDirty(true);
      setNotificationSaveMessage('');
      return next;
    });
  };

  const toggleLevelSmsGroupTarget = (levelKey, groupKey) => {
    const normalizedLevelKey = String(levelKey || '').trim();
    const normalizedGroup = String(groupKey || '').trim().toLowerCase();
    if (!normalizedLevelKey || !normalizedGroup) return;
    updateNotificationDraft((prev) => {
      const level = prev?.[normalizedLevelKey] && typeof prev[normalizedLevelKey] === 'object'
        ? prev[normalizedLevelKey]
        : {};
      const currentTargets = level?.smsTargets && typeof level.smsTargets === 'object'
        ? level.smsTargets
        : { groups: ['admin'], userIds: [] };
      const currentGroups = new Set((Array.isArray(currentTargets.groups) ? currentTargets.groups : []).map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean));
      if (currentGroups.has(normalizedGroup)) currentGroups.delete(normalizedGroup);
      else currentGroups.add(normalizedGroup);
      const nextGroups = Array.from(currentGroups);
      return {
        ...prev,
        [normalizedLevelKey]: {
          ...level,
          smsTargets: {
            groups: nextGroups,
            userIds: Array.isArray(currentTargets.userIds) ? currentTargets.userIds : [],
          },
        },
      };
    });
  };

  const toggleLevelSmsUserTarget = (levelKey, userId) => {
    const normalizedLevelKey = String(levelKey || '').trim();
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedLevelKey || !normalizedUserId) return;
    updateNotificationDraft((prev) => {
      const level = prev?.[normalizedLevelKey] && typeof prev[normalizedLevelKey] === 'object'
        ? prev[normalizedLevelKey]
        : {};
      const currentTargets = level?.smsTargets && typeof level.smsTargets === 'object'
        ? level.smsTargets
        : { groups: ['admin'], userIds: [] };
      const currentUserIds = new Set((Array.isArray(currentTargets.userIds) ? currentTargets.userIds : []).map((entry) => String(entry || '').trim()).filter(Boolean));
      if (currentUserIds.has(normalizedUserId)) currentUserIds.delete(normalizedUserId);
      else currentUserIds.add(normalizedUserId);
      return {
        ...prev,
        [normalizedLevelKey]: {
          ...level,
          smsTargets: {
            groups: Array.isArray(currentTargets.groups) ? currentTargets.groups : ['admin'],
            userIds: Array.from(currentUserIds).slice(0, 100),
          },
        },
      };
    });
  };

  const toggleRuleSmsGroupTarget = (ruleId, groupKey) => {
    const normalizedRuleId = String(ruleId || '').trim();
    const normalizedGroup = String(groupKey || '').trim().toLowerCase();
    if (!normalizedRuleId || !normalizedGroup) return;
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).map((rule) => {
        if (String(rule?.id || '').trim() !== normalizedRuleId) return rule;
        const currentTargets = rule?.smsTargets && typeof rule.smsTargets === 'object'
          ? rule.smsTargets
          : { groups: ['admin'], userIds: [] };
        const groups = new Set((Array.isArray(currentTargets.groups) ? currentTargets.groups : []).map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean));
        if (groups.has(normalizedGroup)) groups.delete(normalizedGroup);
        else groups.add(normalizedGroup);
        return {
          ...rule,
          smsTargets: {
            groups: Array.from(groups),
            userIds: Array.isArray(currentTargets.userIds) ? currentTargets.userIds : [],
          },
        };
      }),
    }));
  };

  const toggleRuleSmsUserTarget = (ruleId, userId) => {
    const normalizedRuleId = String(ruleId || '').trim();
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedRuleId || !normalizedUserId) return;
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).map((rule) => {
        if (String(rule?.id || '').trim() !== normalizedRuleId) return rule;
        const currentTargets = rule?.smsTargets && typeof rule.smsTargets === 'object'
          ? rule.smsTargets
          : { groups: ['admin'], userIds: [] };
        const userIds = new Set((Array.isArray(currentTargets.userIds) ? currentTargets.userIds : []).map((entry) => String(entry || '').trim()).filter(Boolean));
        if (userIds.has(normalizedUserId)) userIds.delete(normalizedUserId);
        else userIds.add(normalizedUserId);
        return {
          ...rule,
          smsTargets: {
            groups: Array.isArray(currentTargets.groups) ? currentTargets.groups : ['admin'],
            userIds: Array.from(userIds).slice(0, 100),
          },
        };
      }),
    }));
  };

  const createNotificationRule = () => ({
    id: `rule_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    enabled: true,
    entityId: '',
    conditionOperator: 'and',
    conditions: [{
      entityId: '',
      conditionType: 'is_active',
      compareValue: '',
    }],
    conditionType: 'is_active',
    compareValue: '',
    title: '',
    message: '',
    level: 'warning',
    channels: {
      inApp: true,
      browser: true,
      native: true,
      sms: false,
    },
    smsTargets: {
      groups: ['admin'],
      userIds: [],
    },
    cooldownSeconds: 300,
  });

  const getRuleConditions = (rule) => {
    const source = rule && typeof rule === 'object' ? rule : {};
    if (Array.isArray(source.conditions) && source.conditions.length > 0) {
      return source.conditions.map((condition) => ({
        entityId: String(condition?.entityId ?? source.entityId ?? '').trim(),
        conditionType: String(condition?.conditionType || 'is_active').trim() || 'is_active',
        compareValue: String(condition?.compareValue ?? ''),
      }));
    }
    return [{
      entityId: String(source.entityId || '').trim(),
      conditionType: String(source.conditionType || 'is_active').trim() || 'is_active',
      compareValue: String(source.compareValue ?? ''),
    }];
  };

  const applyRuleConditionsPatch = (rule, nextConditionsInput, nextOperatorInput = null) => {
    const nextConditions = (Array.isArray(nextConditionsInput) ? nextConditionsInput : [])
      .map((condition) => ({
        entityId: String(condition?.entityId ?? rule?.entityId ?? '').trim(),
        conditionType: String(condition?.conditionType || 'is_active').trim() || 'is_active',
        compareValue: String(condition?.compareValue ?? ''),
      }))
      .slice(0, 8);
    if (nextConditions.length === 0) {
      nextConditions.push({ entityId: String(rule?.entityId || '').trim(), conditionType: 'is_active', compareValue: '' });
    }
    const primary = nextConditions[0];
    const nextOperator = String(nextOperatorInput ?? (rule?.conditionOperator || 'and')).trim().toLowerCase() === 'or'
      ? 'or'
      : 'and';
    return {
      ...rule,
      conditionOperator: nextOperator,
      conditions: nextConditions,
      conditionType: primary.conditionType,
      compareValue: primary.compareValue,
    };
  };

  const addNotificationRule = () => {
    const nextRule = createNotificationRule();
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: [...(Array.isArray(prev.rules) ? prev.rules : []), nextRule],
    }));
    setNotificationRuleExpanded((prev) => ({ ...prev, [nextRule.id]: true }));
  };

  const updateNotificationRule = (ruleId, patch) => {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId) return;
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).map((rule) => {
        if (String(rule?.id || '').trim() !== normalizedRuleId) return rule;
        const merged = { ...rule, ...(patch || {}) };
        const mergedConditions = getRuleConditions(merged);
        return applyRuleConditionsPatch(merged, mergedConditions, merged.conditionOperator);
      }),
    }));
  };

  const updateNotificationRuleConditionOperator = (ruleId, operator) => {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId) return;
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).map((rule) => {
        if (String(rule?.id || '').trim() !== normalizedRuleId) return rule;
        return applyRuleConditionsPatch(rule, getRuleConditions(rule), operator);
      }),
    }));
  };

  const addNotificationRuleCondition = (ruleId) => {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId) return;
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).map((rule) => {
        if (String(rule?.id || '').trim() !== normalizedRuleId) return rule;
        const current = getRuleConditions(rule);
        const next = [...current, {
          entityId: String(rule?.entityId || '').trim(),
          conditionType: 'is_active',
          compareValue: '',
        }].slice(0, 8);
        return applyRuleConditionsPatch(rule, next, rule?.conditionOperator);
      }),
    }));
  };

  const updateNotificationRuleCondition = (ruleId, conditionIndex, patch) => {
    const normalizedRuleId = String(ruleId || '').trim();
    const targetIndex = Number.isInteger(conditionIndex) ? conditionIndex : Number.parseInt(String(conditionIndex || ''), 10);
    if (!normalizedRuleId || !Number.isInteger(targetIndex) || targetIndex < 0) return;
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).map((rule) => {
        if (String(rule?.id || '').trim() !== normalizedRuleId) return rule;
        const current = getRuleConditions(rule);
        if (targetIndex >= current.length) return rule;
        const next = current.map((condition, idx) => (idx === targetIndex ? { ...condition, ...(patch || {}) } : condition));
        return applyRuleConditionsPatch(rule, next, rule?.conditionOperator);
      }),
    }));
  };

  const removeNotificationRuleCondition = (ruleId, conditionIndex) => {
    const normalizedRuleId = String(ruleId || '').trim();
    const targetIndex = Number.isInteger(conditionIndex) ? conditionIndex : Number.parseInt(String(conditionIndex || ''), 10);
    if (!normalizedRuleId || !Number.isInteger(targetIndex) || targetIndex < 0) return;
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).map((rule) => {
        if (String(rule?.id || '').trim() !== normalizedRuleId) return rule;
        const current = getRuleConditions(rule);
        if (current.length <= 1 || targetIndex >= current.length) return rule;
        const next = current.filter((_, idx) => idx !== targetIndex);
        return applyRuleConditionsPatch(rule, next, rule?.conditionOperator);
      }),
    }));
  };

  const removeNotificationRule = (ruleId) => {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId) return;
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).filter(
        (rule) => String(rule?.id || '').trim() !== normalizedRuleId,
      ),
    }));
    setNotificationRuleSearch((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedRuleId)) return prev;
      const next = { ...prev };
      delete next[normalizedRuleId];
      return next;
    });
    setNotificationRuleDomain((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedRuleId)) return prev;
      const next = { ...prev };
      delete next[normalizedRuleId];
      return next;
    });
    setNotificationRuleReferenceEntity((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedRuleId)) return prev;
      const next = { ...prev };
      delete next[normalizedRuleId];
      return next;
    });
    setNotificationRuleExpanded((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, normalizedRuleId)) return prev;
      const next = { ...prev };
      delete next[normalizedRuleId];
      return next;
    });
  };

  const toggleNotificationRuleExpanded = (ruleId) => {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId) return;
    setNotificationRuleExpanded((prev) => ({ ...prev, [normalizedRuleId]: !Boolean(prev[normalizedRuleId]) }));
  };

  const toggleNotificationRuleChannel = (ruleId, channelKey) => {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId) return;
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).map((rule) => {
        if (String(rule?.id || '').trim() !== normalizedRuleId) return rule;
        const channels = rule?.channels && typeof rule.channels === 'object' ? rule.channels : {};
        return {
          ...rule,
          channels: {
            inApp: Boolean(channels.inApp),
            browser: Boolean(channels.browser),
            native: Boolean(channels.native),
            sms: Boolean(channels.sms),
            [channelKey]: !Boolean(channels[channelKey]),
          },
        };
      }),
    }));
  };

  const appendNotificationRuleMessage = (ruleId, snippet) => {
    const normalizedRuleId = String(ruleId || '').trim();
    if (!normalizedRuleId || !snippet) return;
    const addition = String(snippet);
    updateNotificationDraft((prev) => ({
      ...prev,
      rules: (Array.isArray(prev.rules) ? prev.rules : []).map((rule) => {
        if (String(rule?.id || '').trim() !== normalizedRuleId) return rule;
        const current = String(rule?.message || '');
        return { ...rule, message: `${current}${addition}` };
      }),
    }));
  };

  const handleSaveNotifications = async () => {
    if (!canAccessNotifications || typeof onSaveNotificationConfig !== 'function') return;
    const result = await onSaveNotificationConfig(normalizeNotificationConfig(notificationDraft || DEFAULT_NOTIFICATION_CONFIG));
    if (result?.ok) {
      setNotificationDirty(false);
      setNotificationSaveMessage(t('notifications.saved'));
      if (result?.config) setNotificationDraft(normalizeNotificationConfig(result.config));
    } else {
      setNotificationSaveMessage(result?.error || t('notifications.saveFailed'));
    }
  };

  const handleSaveTwilioConfig = async () => {
    if (!isPlatformAdmin || typeof userAdminApi?.saveTwilioSmsConfig !== 'function') return;
    setTwilioConfigSaving(true);
    setTwilioConfigMessage('');
    try {
      const payload = {
        accountSid: String(twilioDraft.accountSid || '').trim(),
        fromNumber: String(twilioDraft.fromNumber || '').trim(),
      };
      if (String(twilioDraft.authToken || '').trim()) {
        payload.authToken = String(twilioDraft.authToken || '').trim();
      }
      const saved = await userAdminApi.saveTwilioSmsConfig(payload);
      setTwilioDraft((prev) => ({
        ...prev,
        accountSid: String(saved?.accountSid || '').trim(),
        fromNumber: String(saved?.fromNumber || '').trim(),
        hasAuthToken: Boolean(saved?.hasAuthToken),
        authToken: '',
        updatedAt: saved?.updatedAt || null,
      }));
      setTwilioConfigMessage('Twilio settings saved');
    } catch (error) {
      setTwilioConfigMessage(String(error?.message || 'Failed to save Twilio settings'));
    } finally {
      setTwilioConfigSaving(false);
    }
  };

  const handleSendTwilioTest = async () => {
    if (!isPlatformAdmin || typeof userAdminApi?.sendTwilioSmsTest !== 'function') return;
    setTwilioTestSending(true);
    setTwilioConfigMessage('');
    try {
      const result = await userAdminApi.sendTwilioSmsTest({
        to: twilioTestTo,
        countryCode: twilioTestCountryCode,
        message: twilioTestMessage,
      });
      if (!result?.success) {
        setTwilioConfigMessage('Twilio test SMS failed');
      } else {
        setTwilioConfigMessage(`Test SMS sent to ${result.to || twilioTestTo}`);
      }
    } catch (error) {
      setTwilioConfigMessage(String(error?.message || 'Failed to send test SMS'));
    } finally {
      setTwilioTestSending(false);
    }
  };

  const renderNotificationsTab = () => {
    const draftSource = notificationDraft && typeof notificationDraft === 'object'
      ? notificationDraft
      : DEFAULT_NOTIFICATION_CONFIG;
    const draft = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      ...draftSource,
      warning: {
        ...DEFAULT_NOTIFICATION_CONFIG.warning,
        ...(draftSource.warning && typeof draftSource.warning === 'object' ? draftSource.warning : {}),
        smsTargets: {
          ...DEFAULT_NOTIFICATION_CONFIG.warning.smsTargets,
          ...(draftSource.warning?.smsTargets && typeof draftSource.warning.smsTargets === 'object'
            ? draftSource.warning.smsTargets
            : {}),
        },
      },
      critical: {
        ...DEFAULT_NOTIFICATION_CONFIG.critical,
        ...(draftSource.critical && typeof draftSource.critical === 'object' ? draftSource.critical : {}),
        smsTargets: {
          ...DEFAULT_NOTIFICATION_CONFIG.critical.smsTargets,
          ...(draftSource.critical?.smsTargets && typeof draftSource.critical.smsTargets === 'object'
            ? draftSource.critical.smsTargets
            : {}),
        },
      },
      rules: Array.isArray(draftSource.rules) ? draftSource.rules : [],
    };
    const warningChannelsEnabled = Boolean(draft.warning.inApp || draft.warning.browser || draft.warning.native || draft.warning.sms);
    const criticalChannelsEnabled = Boolean(draft.critical.inApp || draft.critical.browser || draft.critical.native || draft.critical.sms);
    const saveBlocked = !notificationDirty || notificationConfigSaving || notificationConfigLoading;

    return (
      <div className="space-y-5 font-sans animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="rounded-2xl border border-[var(--glass-border)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--glass-bg)_92%,rgba(56,189,248,0.08)),color-mix(in_srgb,var(--glass-bg)_94%,rgba(14,165,233,0.02)))] p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl border border-sky-400/25 bg-sky-500/10 text-sky-300 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                  {t('notifications.panelTitle')}
                </h4>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {t('notifications.panelDescription')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateNotificationDraft((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`w-10 h-6 rounded-full p-1 transition-colors relative ${draft.enabled ? 'bg-emerald-500' : 'bg-gray-500/30'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${draft.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          {!draft.enabled && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {t('notifications.disabledHint')}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                {t('notifications.warningSensor')}
              </label>
              <input
                value={draft.warningSensorEntityId}
                onChange={(e) => updateNotificationDraft((prev) => ({ ...prev, warningSensorEntityId: e.target.value }))}
                list="notification-entity-options"
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                placeholder="sensor.system_warning_details"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                {t('notifications.criticalSensor')}
              </label>
              <input
                value={draft.criticalSensorEntityId}
                onChange={(e) => updateNotificationDraft((prev) => ({ ...prev, criticalSensorEntityId: e.target.value }))}
                list="notification-entity-options"
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                placeholder="sensor.system_critical_details"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                {t('notifications.inAppDurationSeconds')}
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={Math.max(1, Math.round(Number(draft.inAppDurationMs || 7000) / 1000))}
                onChange={(e) => updateNotificationDraft((prev) => ({
                  ...prev,
                  inAppDurationMs: Math.max(1000, Math.min(120000, (Number.parseInt(e.target.value || '7', 10) || 7) * 1000)),
                }))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                {t('notifications.browserBehavior')}
              </label>
              <button
                type="button"
                onClick={() => updateNotificationDraft((prev) => ({ ...prev, browserOnlyWhenBackground: !prev.browserOnlyWhenBackground }))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm text-left"
              >
                {draft.browserOnlyWhenBackground
                  ? t('notifications.browserOnlyBackground')
                  : t('notifications.browserAlsoForeground')}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">{t('notifications.inAppPersistent')}</span>
            <button
              type="button"
              onClick={() => updateNotificationDraft((prev) => ({ ...prev, inAppPersistent: !prev.inAppPersistent }))}
              className={`w-10 h-6 rounded-full p-1 transition-colors relative ${draft.inAppPersistent ? 'bg-emerald-500' : 'bg-gray-500/30'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${draft.inAppPersistent ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
            <p className="text-xs font-semibold text-emerald-300">
              {t('notifications.appActionAuditAlwaysOn')}
            </p>
            <p className="text-[11px] text-emerald-200/85 mt-0.5">
              {t('notifications.appActionAuditAlwaysOnDescription')}
            </p>
          </div>
        </div>

        {isPlatformAdmin ? (
          <div className="rounded-2xl border border-[var(--glass-border)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--glass-bg)_92%,rgba(34,197,94,0.07)),color-mix(in_srgb,var(--glass-bg)_95%,transparent))] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                  Twilio SMS
                </h4>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Configure account SID, auth token, and sender number. This is global for all clients.
                </p>
              </div>
              {twilioConfigLoading ? (
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{t('common.loading')}</span>
              ) : null}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">Account SID</label>
                <input
                  value={twilioDraft.accountSid}
                  onChange={(e) => setTwilioDraft((prev) => ({ ...prev, accountSid: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                  placeholder="AC..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">From number (E.164)</label>
                <input
                  value={twilioDraft.fromNumber}
                  onChange={(e) => setTwilioDraft((prev) => ({ ...prev, fromNumber: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                  placeholder="+4712345678"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">Auth token {twilioDraft.hasAuthToken ? '(saved)' : '(not set)'}</label>
                <input
                  type="password"
                  value={twilioDraft.authToken}
                  onChange={(e) => setTwilioDraft((prev) => ({ ...prev, authToken: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                  placeholder="Leave empty to keep current token"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSaveTwilioConfig()}
                disabled={twilioConfigSaving || twilioConfigLoading}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
              >
                {twilioConfigSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>

            <div className="pt-2 border-t border-[var(--glass-border)] space-y-2">
              <h5 className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">Send test SMS</h5>
              <div className="grid grid-cols-1 md:grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <input
                  value={twilioTestCountryCode}
                  onChange={(e) => setTwilioTestCountryCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                  placeholder="+47"
                />
                <input
                  value={twilioTestTo}
                  onChange={(e) => setTwilioTestTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                  placeholder="99999999"
                />
              </div>
              <textarea
                value={twilioTestMessage}
                onChange={(e) => setTwilioTestMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm min-h-[76px]"
                placeholder="Test message"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSendTwilioTest()}
                  disabled={twilioTestSending || twilioConfigLoading}
                  className="px-4 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  {twilioTestSending ? t('common.saving') : 'Send test'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-[var(--glass-border)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--glass-bg)_92%,rgba(45,212,191,0.07)),color-mix(in_srgb,var(--glass-bg)_95%,transparent))] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                {t('notifications.appActionHistoryTitle')}
              </h4>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {t('notifications.appActionHistoryDescription')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadAppActionHistory()}
                disabled={appActionHistoryLoading || appActionHistoryBusy}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
              >
                {t('notifications.appActionHistoryRefresh')}
              </button>
              <button
                type="button"
                onClick={() => void clearAllAppActions()}
                disabled={appActionHistoryLoading || appActionHistoryBusy}
                className="px-2.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
              >
                {t('notifications.appActionHistoryClear')}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] max-h-72 overflow-y-auto custom-scrollbar divide-y divide-[var(--glass-border)]">
            {appActionHistoryLoading && (
              <div className="px-3 py-4 text-xs text-[var(--text-secondary)]">
                {t('common.loading')}
              </div>
            )}
            {!appActionHistoryLoading && (!Array.isArray(appActionHistory) || appActionHistory.length === 0) && (
              <div className="px-3 py-4 text-xs text-[var(--text-secondary)]">
                {t('notifications.appActionHistoryEmpty')}
              </div>
            )}
            {!appActionHistoryLoading && Array.isArray(appActionHistory) && appActionHistory.map((entry, entryIndex) => {
              const createdAt = Date.parse(String(entry?.createdAt || ''));
              const when = Number.isFinite(createdAt)
                ? new Date(createdAt).toLocaleString()
                : '--';
              const action = `${String(entry?.domain || '').trim()}.${String(entry?.service || '').trim()}`.replace(/^\./, '');
              const entityName = String(entry?.entityName || '').trim();
              const entityId = String(entry?.entityId || '').trim();
              const actorName = String(entry?.actor?.username || '').trim() || '-';
              return (
                <div key={String(entry?.id || `action_${entryIndex}`)} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-widest font-bold text-[var(--text-secondary)] truncate">
                        {action || t('notifications.appActionHistoryFallback')}
                      </p>
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate mt-0.5">
                        {entityName || entityId || '-'}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">
                        {t('notifications.appActionHistoryActor')}: {actorName}
                        {entityId ? ` • ${entityId}` : ''}
                      </p>
                    </div>
                    <div className="flex items-start gap-2 shrink-0">
                      <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap pt-0.5">{when}</span>
                      <button
                        type="button"
                        onClick={() => void deleteAppActionEntry(entry?.id)}
                        disabled={appActionHistoryBusy}
                        className="px-2 py-1 rounded-md border border-red-500/25 bg-red-500/10 text-red-300 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {appActionHistoryMessage ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              {appActionHistoryMessage}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              key: 'warning',
              title: t('notifications.warningChannels'),
              channels: draft.warning,
              hasAny: warningChannelsEnabled,
              icon: AlertCircle,
              accent: 'amber',
            },
            {
              key: 'critical',
              title: t('notifications.criticalChannels'),
              channels: draft.critical,
              hasAny: criticalChannelsEnabled,
              icon: AlertTriangle,
              accent: 'rose',
            },
          ].map((entry) => (
            <div
              key={entry.key}
              className={`rounded-2xl border border-[var(--glass-border)] p-4 space-y-3 ${
                entry.accent === 'rose'
                  ? 'bg-[linear-gradient(145deg,color-mix(in_srgb,var(--glass-bg)_94%,rgba(244,63,94,0.09)),color-mix(in_srgb,var(--glass-bg)_96%,transparent))]'
                  : 'bg-[linear-gradient(145deg,color-mix(in_srgb,var(--glass-bg)_94%,rgba(245,158,11,0.08)),color-mix(in_srgb,var(--glass-bg)_96%,transparent))]'
              }`}
            >
              <h4 className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)] flex items-center gap-2">
                <entry.icon className={`w-3.5 h-3.5 ${entry.accent === 'rose' ? 'text-rose-300' : 'text-amber-300'}`} />
                {entry.title}
              </h4>
              {(() => {
                const smsTargets = entry.channels?.smsTargets && typeof entry.channels.smsTargets === 'object'
                  ? entry.channels.smsTargets
                  : { groups: ['admin'], userIds: [] };
                const selectedGroups = new Set((Array.isArray(smsTargets.groups) ? smsTargets.groups : []).map((group) => String(group || '').trim().toLowerCase()));
                const selectedUserIds = new Set((Array.isArray(smsTargets.userIds) ? smsTargets.userIds : []).map((userId) => String(userId || '').trim()));
                return (
                  <>
              <div className="space-y-2">
                {['inApp', 'browser', 'native', 'sms'].map((channel) => (
                  <button
                    key={`${entry.key}_${channel}`}
                    type="button"
                    onClick={() => updateNotificationDraft((prev) => ({
                      ...prev,
                      [entry.key]: {
                        ...prev[entry.key],
                        [channel]: !prev[entry.key][channel],
                      },
                    }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
                      entry.channels[channel]
                        ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
                        : 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className="text-xs font-semibold">{t(`notifications.channel.${channel}`)}</span>
                    <span className="text-[10px] uppercase tracking-widest font-bold">
                      {entry.channels[channel] ? t('common.on') : t('common.off')}
                    </span>
                  </button>
                ))}
              </div>
              {entry.channels.sms ? (
                <div className="space-y-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">SMS recipients</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['admin', 'user', 'inspector'].map((groupKey) => {
                      const active = selectedGroups.has(groupKey);
                      return (
                        <button
                          key={`${entry.key}_group_${groupKey}`}
                          type="button"
                          onClick={() => toggleLevelSmsGroupTarget(entry.key, groupKey)}
                          className={`px-2 py-1.5 rounded-md border text-[10px] uppercase tracking-wider font-bold transition-colors ${
                            active
                              ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
                              : 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]'
                          }`}
                        >
                          {t(`role.${groupKey}`)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] max-h-28 overflow-y-auto custom-scrollbar divide-y divide-[var(--glass-border)]">
                    {notificationRecipientUsers.length === 0 ? (
                      <div className="px-2.5 py-2 text-[11px] text-[var(--text-muted)]">No users found</div>
                    ) : notificationRecipientUsers.map((user) => {
                      const selected = selectedUserIds.has(user.id);
                      return (
                        <button
                          key={`${entry.key}_user_${user.id}`}
                          type="button"
                          onClick={() => toggleLevelSmsUserTarget(entry.key, user.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                            selected ? 'bg-indigo-500/12 text-indigo-200' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]'
                          }`}
                        >
                          <span className="truncate">{user.label}</span>
                          <span className="text-[10px] uppercase tracking-wider opacity-80">{t(`role.${user.role}`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                  {t('notifications.cooldownSeconds')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={86400}
                  value={Number(entry.channels.cooldownSeconds) || 0}
                  onChange={(e) => updateNotificationDraft((prev) => ({
                    ...prev,
                    [entry.key]: {
                      ...prev[entry.key],
                      cooldownSeconds: Math.max(0, Math.min(86400, Number.parseInt(e.target.value || '0', 10) || 0)),
                    },
                  }))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                />
              </div>
              {!entry.hasAny && (
                <p className="text-[11px] text-amber-300">{t('notifications.noChannelWarning')}</p>
              )}
                  </>
                );
              })()}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[var(--glass-border)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--glass-bg)_92%,rgba(167,139,250,0.08)),color-mix(in_srgb,var(--glass-bg)_95%,transparent))] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg border border-violet-400/25 bg-violet-500/10 text-violet-300 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
              <h4 className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                {t('notifications.customRulesTitle')}
              </h4>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {t('notifications.customRulesDescription')}
              </p>
              </div>
            </div>
            <button
              type="button"
              onClick={addNotificationRule}
              className="px-3 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[11px] font-bold uppercase tracking-wider"
            >
              {t('notifications.addRule')}
            </button>
          </div>

          {(!Array.isArray(draft.rules) || draft.rules.length === 0) && (
            <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              {t('notifications.noRules')}
            </div>
          )}

          <datalist id="notification-entity-options">
            {notificationEntityIds.map((entityId) => (
              <option key={entityId} value={entityId} />
            ))}
          </datalist>

          <div className="space-y-3">
            {(Array.isArray(draft.rules) ? draft.rules : []).map((rule, idx) => {
              const normalizedRule = rule && typeof rule === 'object' ? rule : {};
              const ruleId = String(normalizedRule.id || '').trim() || `rule_${idx}`;
              const channels = normalizedRule.channels && typeof normalizedRule.channels === 'object'
                ? normalizedRule.channels
                : { inApp: true, browser: true, native: true, sms: false };
              const ruleSmsTargets = normalizedRule.smsTargets && typeof normalizedRule.smsTargets === 'object'
                ? normalizedRule.smsTargets
                : { groups: ['admin'], userIds: [] };
              const selectedRuleGroups = new Set((Array.isArray(ruleSmsTargets.groups) ? ruleSmsTargets.groups : []).map((group) => String(group || '').trim().toLowerCase()));
              const selectedRuleUserIds = new Set((Array.isArray(ruleSmsTargets.userIds) ? ruleSmsTargets.userIds : []).map((userId) => String(userId || '').trim()));
              const ruleConditions = getRuleConditions(normalizedRule);
              const conditionOperator = String(normalizedRule.conditionOperator || 'and').trim().toLowerCase() === 'or'
                ? 'or'
                : 'and';
              const selectedEntityId = String(normalizedRule.entityId || '').trim();
              const selectedOption = notificationEntityOptions.find((option) => option.id === selectedEntityId) || null;
              const selectedDomain = String(notificationRuleDomain[ruleId] || 'all').trim() || 'all';
              const searchQuery = String(notificationRuleSearch[ruleId] || '').toLowerCase().trim();
              const filteredEntityOptions = notificationEntityOptions
                .filter((option) => selectedDomain === 'all' || option.domain === selectedDomain)
                .filter((option) => !searchQuery || option.searchKey.includes(searchQuery) || option.id === selectedEntityId)
                .slice(0, 40);
              const referenceEntityId = String(notificationRuleReferenceEntity[ruleId] || selectedEntityId).trim();
              const isExpanded = Boolean(notificationRuleExpanded[ruleId]);
              const firstCondition = ruleConditions[0] || { conditionType: 'is_active', compareValue: '' };
              const conditionSummary = ruleConditions.length <= 1
                ? t(`notifications.condition.${String(firstCondition.conditionType || 'is_active').trim()}`)
                : `${t(`notifications.conditionOperator.${conditionOperator}`)} • ${ruleConditions.length}`;
              const severitySummary = t(`notifications.severity.${String(normalizedRule.level || 'warning').trim()}`);
              const headerTitle = String(normalizedRule.title || '').trim()
                || selectedOption?.friendlyName
                || selectedEntityId
                || t('notifications.ruleTitlePlaceholder');
              return (
                <div key={ruleId} className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] p-3 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleNotificationRuleExpanded(ruleId)}
                      className="flex-1 min-w-0 text-left rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-2 hover:bg-[var(--glass-bg-hover)] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                          {t('notifications.ruleLabel')} {idx + 1}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                        )}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-[var(--text-primary)] truncate">
                        {headerTitle}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--text-secondary)]">
                        <span className="truncate max-w-full">{selectedOption?.id || selectedEntityId || '-'}</span>
                        <span className="opacity-70">•</span>
                        <span>{conditionSummary}</span>
                        <span className="opacity-70">•</span>
                        <span>{severitySummary}</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateNotificationRule(ruleId, { enabled: !normalizedRule.enabled })}
                        className={`w-10 h-6 rounded-full p-1 transition-colors relative ${normalizedRule.enabled ? 'bg-emerald-500' : 'bg-gray-500/30'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${normalizedRule.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeNotificationRule(ruleId)}
                        className="px-2 py-1 rounded-lg border border-red-500/25 bg-red-500/10 text-red-300 text-[10px] uppercase tracking-wider font-bold"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                        <Type className="w-3 h-3" />
                        {t('notifications.ruleTitle')}
                      </label>
                      <input
                        value={String(normalizedRule.title || '')}
                        onChange={(e) => updateNotificationRule(ruleId, { title: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm"
                        placeholder={t('notifications.ruleTitlePlaceholder')}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                        <Search className="w-3 h-3" />
                        {t('notifications.ruleEntity')}
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_12rem] gap-2">
                        <input
                          value={String(notificationRuleSearch[ruleId] || '')}
                          onChange={(e) => setNotificationRuleSearch((prev) => ({ ...prev, [ruleId]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm"
                          placeholder={t('notifications.ruleEntitySearchPlaceholder')}
                        />
                        <select
                          value={selectedDomain}
                          onChange={(e) => setNotificationRuleDomain((prev) => ({ ...prev, [ruleId]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm"
                        >
                          <option value="all">{t('notifications.ruleEntityDomainAll')}</option>
                          {notificationEntityDomains.map((domain) => (
                            <option key={`${ruleId}_domain_${domain}`} value={domain}>{domain}</option>
                          ))}
                        </select>
                      </div>
                      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] max-h-36 overflow-y-auto custom-scrollbar">
                        {filteredEntityOptions.length === 0 && (
                          <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]">{t('form.noResults')}</div>
                        )}
                        {filteredEntityOptions.map((option) => {
                          const isSelected = option.id === selectedEntityId;
                          return (
                            <button
                              key={`${ruleId}_${option.id}`}
                              type="button"
                              onClick={() => updateNotificationRule(ruleId, { entityId: option.id })}
                              className={`w-full text-left px-3 py-2 border-b border-[var(--glass-border)] last:border-b-0 transition-colors ${
                                isSelected ? 'bg-blue-500/15 text-blue-300' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'
                              }`}
                            >
                              <div className="text-xs font-bold truncate">
                                {option.friendlyName || option.id}
                              </div>
                              <div className="text-[10px] text-[var(--text-muted)] truncate">
                                {option.id} • {option.domain} • {option.state || '-'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {selectedOption && (
                        <div className="text-[10px] text-[var(--text-secondary)]">
                          {t('notifications.ruleEntitySelected')}: <span className="font-semibold text-[var(--text-primary)]">{selectedOption.friendlyName || selectedOption.id}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_12rem] gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                            {t('notifications.ruleCondition')}
                          </label>
                          <div className="px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs text-[var(--text-secondary)]">
                            {selectedOption?.friendlyName || selectedEntityId || t('notifications.ruleEntity')}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                            {t('notifications.ruleConditionOperator')}
                          </label>
                          <select
                            value={conditionOperator}
                            onChange={(e) => updateNotificationRuleConditionOperator(ruleId, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm"
                          >
                            <option value="and">{t('notifications.conditionOperator.and')}</option>
                            <option value="or">{t('notifications.conditionOperator.or')}</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {ruleConditions.map((condition, conditionIdx) => {
                          const showClauseCompareValue = condition.conditionType === 'greater_than'
                            || condition.conditionType === 'less_than'
                            || condition.conditionType === 'equals';
                          const clauseEntityId = String(condition.entityId || selectedEntityId).trim();
                          const clauseEntityOption = notificationEntityOptions.find((option) => option.id === clauseEntityId) || null;
                          return (
                            <div
                              key={`${ruleId}_condition_${conditionIdx}`}
                              className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                                  {t('notifications.ruleClauseLabel')} {conditionIdx + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeNotificationRuleCondition(ruleId, conditionIdx)}
                                  disabled={ruleConditions.length <= 1}
                                  className="px-2 py-1 rounded-md border border-red-500/25 bg-red-500/10 text-red-300 text-[10px] uppercase tracking-wider font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {t('common.delete')}
                                </button>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_12rem_12rem] gap-2">
                                <input
                                  value={String(condition.entityId ?? '')}
                                  onChange={(e) => updateNotificationRuleCondition(ruleId, conditionIdx, { entityId: e.target.value })}
                                  list="notification-entity-options"
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                                  placeholder={t('notifications.ruleClauseEntityPlaceholder')}
                                />
                                <select
                                  value={String(condition.conditionType || 'is_active')}
                                  onChange={(e) => updateNotificationRuleCondition(ruleId, conditionIdx, { conditionType: e.target.value })}
                                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                                >
                                  <option value="is_active">{t('notifications.condition.is_active')}</option>
                                  <option value="greater_than">{t('notifications.condition.greater_than')}</option>
                                  <option value="less_than">{t('notifications.condition.less_than')}</option>
                                  <option value="equals">{t('notifications.condition.equals')}</option>
                                </select>
                                {showClauseCompareValue ? (
                                  <input
                                    value={String(condition.compareValue ?? '')}
                                    onChange={(e) => updateNotificationRuleCondition(ruleId, conditionIdx, { compareValue: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-sm"
                                    placeholder={t('notifications.ruleValuePlaceholder')}
                                  />
                                ) : (
                                  <div className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-xs text-[var(--text-secondary)]">
                                    {t('notifications.ruleValueNotRequired')}
                                  </div>
                                )}
                              </div>
                              <div className="text-[10px] text-[var(--text-secondary)]">
                                {t('notifications.ruleEntitySelected')}: <span className="font-semibold text-[var(--text-primary)]">{clauseEntityOption?.friendlyName || clauseEntityId || '-'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => addNotificationRuleCondition(ruleId)}
                        disabled={ruleConditions.length >= 8}
                        className="px-2.5 py-1.5 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t('notifications.addCondition')}
                      </button>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                        {t('notifications.ruleSeverity')}
                      </label>
                      <select
                        value={String(normalizedRule.level || 'warning')}
                        onChange={(e) => updateNotificationRule(ruleId, { level: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm"
                      >
                        <option value="info">{t('notifications.severity.info')}</option>
                        <option value="warning">{t('notifications.severity.warning')}</option>
                        <option value="critical">{t('notifications.severity.critical')}</option>
                        <option value="success">{t('notifications.severity.success')}</option>
                      </select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                        <AlignLeft className="w-3 h-3" />
                        {t('notifications.ruleMessage')}
                      </label>
                      <NotificationRichTextEditor
                        value={String(normalizedRule.message || '')}
                        onChange={(nextValue) => updateNotificationRule(ruleId, { message: nextValue })}
                        placeholder={t('notifications.ruleMessagePlaceholder')}
                        t={t}
                      />
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        {t('notifications.ruleMessageFormattingHint')}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => appendNotificationRuleMessage(ruleId, '{entityName}')}
                          className="px-2 py-1 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[10px] font-bold uppercase tracking-wider"
                        >
                          {t('notifications.tokenEntityName')}
                        </button>
                        <button
                          type="button"
                          onClick={() => appendNotificationRuleMessage(ruleId, '{state}')}
                          className="px-2 py-1 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[10px] font-bold uppercase tracking-wider"
                        >
                          {t('notifications.tokenState')}
                        </button>
                        <button
                          type="button"
                          onClick={() => appendNotificationRuleMessage(ruleId, '{threshold}')}
                          className="px-2 py-1 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[10px] font-bold uppercase tracking-wider"
                        >
                          {t('notifications.tokenThreshold')}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
                        <input
                          value={referenceEntityId}
                          onChange={(e) => setNotificationRuleReferenceEntity((prev) => ({ ...prev, [ruleId]: e.target.value }))}
                          list="notification-entity-options"
                          className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs"
                          placeholder={t('notifications.referenceEntityPlaceholder')}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!referenceEntityId) return;
                            appendNotificationRuleMessage(ruleId, `{{state:${referenceEntityId}}}`);
                          }}
                          className="px-2 py-2 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                        >
                          {t('notifications.insertStateToken')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!referenceEntityId) return;
                            appendNotificationRuleMessage(ruleId, `{{name:${referenceEntityId}}}`);
                          }}
                          className="px-2 py-2 rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                        >
                          {t('notifications.insertNameToken')}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                        {t('notifications.cooldownSeconds')}
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={86400}
                        value={Number(normalizedRule.cooldownSeconds) || 0}
                        onChange={(e) => updateNotificationRule(ruleId, {
                          cooldownSeconds: Math.max(0, Math.min(86400, Number.parseInt(e.target.value || '0', 10) || 0)),
                        })}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                        {t('notifications.ruleChannels')}
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                        {['inApp', 'browser', 'native', 'sms'].map((channel) => (
                          <button
                            key={`${ruleId}_${channel}`}
                            type="button"
                            onClick={() => toggleNotificationRuleChannel(ruleId, channel)}
                            className={`px-2 py-2 rounded-md border text-[10px] uppercase tracking-wider font-bold transition-colors ${
                              channels[channel]
                                ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
                                : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {t(`notifications.channel.${channel}`)}
                          </button>
                        ))}
                      </div>
                      {channels.sms ? (
                        <div className="mt-2 space-y-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">SMS recipients</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {['admin', 'user', 'inspector'].map((groupKey) => {
                              const active = selectedRuleGroups.has(groupKey);
                              return (
                                <button
                                  key={`${ruleId}_group_${groupKey}`}
                                  type="button"
                                  onClick={() => toggleRuleSmsGroupTarget(ruleId, groupKey)}
                                  className={`px-2 py-1.5 rounded-md border text-[10px] uppercase tracking-wider font-bold transition-colors ${
                                    active
                                      ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
                                      : 'border-[var(--glass-border)] bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]'
                                  }`}
                                >
                                  {t(`role.${groupKey}`)}
                                </button>
                              );
                            })}
                          </div>
                          <div className="rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-hover)] max-h-28 overflow-y-auto custom-scrollbar divide-y divide-[var(--glass-border)]">
                            {notificationRecipientUsers.length === 0 ? (
                              <div className="px-2.5 py-2 text-[11px] text-[var(--text-muted)]">No users found</div>
                            ) : notificationRecipientUsers.map((user) => {
                              const selected = selectedRuleUserIds.has(user.id);
                              return (
                                <button
                                  key={`${ruleId}_user_${user.id}`}
                                  type="button"
                                  onClick={() => toggleRuleSmsUserTarget(ruleId, user.id)}
                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                                    selected ? 'bg-indigo-500/12 text-indigo-200' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]'
                                  }`}
                                >
                                  <span className="truncate">{user.label}</span>
                                  <span className="text-[10px] uppercase tracking-wider opacity-80">{t(`role.${user.role}`)}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {(notificationSaveMessage || notificationConfigMessage || twilioConfigMessage) && (
          <div className="rounded-xl p-3 text-xs font-semibold bg-[var(--glass-bg)] border border-[var(--glass-border)]">
            {notificationSaveMessage || notificationConfigMessage || twilioConfigMessage}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveNotifications}
            disabled={saveBlocked}
            className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {notificationConfigSaving ? t('common.saving') : t('notifications.saveConfig')}
          </button>
        </div>
      </div>
    );
  };

  // ─── Appearance Tab (moved to ThemeSidebar) ───
  const _renderAppearanceTab = () => {
    const bgModes = [
      { key: 'theme', icon: Sparkles, label: t('settings.bgFollowTheme') },
      { key: 'solid', icon: Sun, label: t('settings.bgSolid') },
      { key: 'gradient', icon: Moon, label: t('settings.bgGradient') },
      { key: 'animated', icon: Sparkles, label: 'Aurora' },
    ];

    const resetBackground = () => {
      setBgMode('theme');
      setBgColor('#0f172a');
      setBgGradient('midnight');
      setBgImage('');
    };

    return (
      <div className="space-y-8 font-sans animate-in fade-in slide-in-from-right-4 duration-300">
        {/* Theme & Language */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <ModernDropdown
              label={t('settings.theme')}
              icon={Palette}
              options={Object.keys(themes)}
              current={currentTheme}
              onChange={setCurrentTheme}
              map={{ dark: t('theme.dark'), light: t('theme.light'), contextual: 'Smart (Auto)' }}
              placeholder={t('dropdown.noneSelected')}
            />
            <ModernDropdown
              label={t('settings.language')}
              icon={Globe}
              options={['nn', 'nb', 'en']}
              current={language}
              onChange={setLanguage}
              map={{ nn: t('language.nn'), nb: t('language.nb'), en: t('language.en') }}
              placeholder={t('dropdown.noneSelected')}
            />
          </div>
        </div>

        {/* Background */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase font-bold text-gray-500 ml-1 tracking-widest">{t('settings.background')}</p>
            <button 
              type="button"
              onClick={resetBackground}
              className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-color)] hover:bg-[var(--accent-bg)] rounded-lg transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Mode Selector - Compact */}
          <div className="grid grid-cols-4 gap-2">
            {bgModes.map(mode => {
              const active = bgMode === mode.key;
              const ModeIcon = mode.icon;
              return (
                <button
                  key={mode.key}
                  onClick={() => setBgMode(mode.key)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all text-center ${
                    active
                      ? 'bg-[var(--accent-bg)] ring-1 ring-[var(--accent-color)] text-[var(--accent-color)]'
                      : 'bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]'
                  }`}
                >
                  <ModeIcon className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-wider leading-tight">{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mode-specific controls */}
          {bgMode === 'theme' && (
             <div className="py-2 text-center">
               <p className="text-xs text-[var(--text-secondary)] font-medium">{t('settings.bgFollowThemeHint')}</p>
             </div>
          )}

          {bgMode === 'solid' && (
            <div className="py-2 flex items-center gap-4">
              <label className="relative cursor-pointer group">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div
                  className="w-12 h-12 rounded-xl border-2 border-[var(--glass-border)] group-hover:border-[var(--accent-color)] transition-colors shadow-inner"
                  style={{ backgroundColor: bgColor }}
                />
              </label>
              <div className="flex-1">
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(val)) setBgColor(val);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--glass-bg-hover)] border border-[var(--glass-border)] text-[var(--text-primary)] font-mono text-sm outline-none focus:border-[var(--accent-color)] transition-colors"
                  placeholder="#0f172a"
                  maxLength={7}
                />
              </div>
            </div>
          )}

          {bgMode === 'gradient' && (
            <div className="flex flex-wrap gap-3 py-2">
              {Object.entries(GRADIENT_PRESETS).map(([key, preset]) => {
                const active = bgGradient === key;
                return (
                  <button
                    key={key}
                    onClick={() => setBgGradient(key)}
                    className="group relative flex-shrink-0"
                    title={preset.label}
                  >
                    <div
                      className={`w-14 h-14 rounded-xl transition-all ${
                        active ? 'ring-2 ring-[var(--accent-color)] ring-offset-2 ring-offset-[var(--modal-bg)] scale-110' : 'hover:scale-105'
                      }`}
                      style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
                    />
                    <p className={`text-[9px] font-bold uppercase tracking-wider mt-1.5 text-center ${active ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]'}`}>
                      {preset.label}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {bgMode === 'custom' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3">
                <div className="relative">
                  <input
                    type="url"
                    value={bgImage}
                    onChange={(e) => setBgImage(e.target.value)}
                    className="w-full px-4 py-3.5 pl-10 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] text-xs outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-[var(--text-muted)]"
                    placeholder={t('settings.bgUrl')}
                  />
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                </div>
              </div>
            </div>
          )}

          {/* Behavior */}
          <div className="pt-4 border-t border-[var(--glass-border)] space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Home className="w-4 h-4 text-[var(--accent-color)]" />
                  {t('settings.inactivity')}
                </label>
                <div className="flex items-center gap-3">
                   <button 
                    onClick={() => {
                      const newVal = inactivityTimeout > 0 ? 0 : 60;
                      setInactivityTimeout(newVal);
                      try { localStorage.setItem('tunet_inactivity_timeout', String(newVal)); } catch {}
                    }}
                    className={`w-10 h-6 rounded-full p-1 transition-colors relative ${inactivityTimeout > 0 ? 'bg-[var(--accent-color)]' : 'bg-gray-500/30'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${inactivityTimeout > 0 ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
              
              {inactivityTimeout > 0 && (
                <div className="px-1 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                   <div className="flex justify-end mb-1">
                     <span className="text-xs font-bold text-[var(--text-secondary)]">{inactivityTimeout}s</span>
                   </div>
                  <M3Slider
                    min={10}
                    max={300}
                    step={10}
                    value={inactivityTimeout}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setInactivityTimeout(val);
                      try { localStorage.setItem('tunet_inactivity_timeout', String(val)); } catch {}
                    }}
                  colorClass="bg-blue-500"
                />
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Layout Tab ───
  const toggleSection = (key) => setLayoutSections(prev => ({ ...prev, [key]: !prev[key] }));

  const _renderLayoutTab = () => {

    const ResetButton = ({ onClick }) => (
      <button 
        onClick={onClick}
        className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-all"
        title="Reset"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    );

    // Accordion section wrapper
    const Section = ({ id, icon: Icon, title, children }) => {
      const isOpen = layoutSections[id];
      return (
        <div className={`rounded-2xl px-3 py-0.5 transition-all ${isOpen ? 'bg-white/[0.03]' : ''}`}>
          <button
            type="button"
            onClick={() => toggleSection(id)}
            className="w-full flex items-center gap-3 py-2.5 text-left transition-colors group"
          >
            <div className={`p-1.5 rounded-xl transition-colors ${isOpen ? 'bg-[var(--accent-bg)] text-[var(--accent-color)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'}`}>
              <Icon className="w-4 h-4" />
            </div>
            <span className={`flex-1 text-[13px] font-semibold transition-colors ${isOpen ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{title}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          <div
            className="grid transition-all duration-200 ease-in-out"
            style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="pl-7 pr-0 pb-3 pt-0.5 space-y-5">
                {children}
              </div>
            </div>
          </div>
        </div>
      );
    };

    const hts = sectionSpacing?.headerToStatus ?? 16;
    const stn = sectionSpacing?.statusToNav ?? 24;
    const ntg = sectionSpacing?.navToGrid ?? 24;

    return (
      <div className="space-y-1 font-sans animate-in fade-in slide-in-from-right-4 duration-300">
        {/* Header row: title + live preview */}
        <div className="flex items-center justify-between px-1 pb-3">
          <p className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('settings.layout')}</p>
          <button
            type="button"
            onClick={() => setLayoutPreview(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-colors ${
              layoutPreview
                ? 'bg-[var(--accent-bg)] border-[var(--accent-color)] text-[var(--accent-color)]'
                : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            aria-pressed={layoutPreview}
          >
            <Monitor className="w-3 h-3" />
            {t('settings.livePreview')}
          </button>
        </div>

        {/* ── Grid Section ── */}
        <Section
          id="grid"
          icon={Columns}
          title={t('settings.layoutGrid')}
        >
          {/* Columns */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('settings.gridColumns')}</span>
              {gridColumns !== 4 && <ResetButton onClick={() => setGridColumns(4)} />}
            </div>
            <div className="grid grid-cols-5 gap-1.5 p-0.5 rounded-xl">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(cols => (
                <button
                  key={cols}
                  onClick={() => setGridColumns(cols)}
                  className={`py-2 rounded-lg font-bold text-xs transition-all ${
                    gridColumns === cols
                      ? 'bg-[var(--accent-color)] text-white shadow-lg shadow-[var(--accent-color)]/20'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'
                  }`}
                >
                  {cols}
                </button>
              ))}
            </div>
          </div>

          {/* Grid Spacing */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('settings.gridGap') || 'Grid Spacing'}</span>
              {(gridGapH !== 20 || gridGapV !== 20) && (
                 <ResetButton onClick={() => { setGridGapH(20); setGridGapV(20); }} />
              )}
            </div>
            
            <div className="space-y-5 pl-3 border-l-2 border-[var(--glass-border)] ml-1">
                {/* Horizontal */}
                <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.gridGapH') || 'Vannrett'}</span>
                     <span className="text-[11px] tabular-nums text-[var(--text-muted)] font-mono">{gridGapH}px</span>
                   </div>
                   <M3Slider
                      min={0}
                      max={64}
                      step={4}
                      value={gridGapH}
                      onChange={(e) => setGridGapH(parseInt(e.target.value, 10))}
                      colorClass="bg-blue-500"
                    />
                </div>

                {/* Vertical */}
                <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <span className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">{t('settings.gridGapV') || 'Loddrett'}</span>
                     <span className="text-[11px] tabular-nums text-[var(--text-muted)] font-mono">{gridGapV}px</span>
                   </div>
                   <M3Slider
                      min={0}
                      max={64}
                      step={4}
                      value={gridGapV}
                      onChange={(e) => setGridGapV(parseInt(e.target.value, 10))}
                      colorClass="bg-blue-500"
                    />
                </div>
            </div>
          </div>
        </Section>

        {/* ── Spacing Section ── */}
        <Section
          id="spacing"
          icon={LayoutGrid}
          title={t('settings.sectionSpacing')}
        >
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('settings.sectionSpacingHeader')}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{hts}px</span>
                {hts !== 16 && <ResetButton onClick={() => updateSectionSpacing({ headerToStatus: 16 })} />}
              </div>
            </div>
            <M3Slider min={0} max={64} step={4} value={hts} onChange={(e) => updateSectionSpacing({ headerToStatus: parseInt(e.target.value, 10) })} colorClass="bg-blue-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('settings.sectionSpacingNav')}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{stn}px</span>
                {stn !== 24 && <ResetButton onClick={() => updateSectionSpacing({ statusToNav: 24 })} />}
              </div>
            </div>
            <M3Slider min={0} max={64} step={4} value={stn} onChange={(e) => updateSectionSpacing({ statusToNav: parseInt(e.target.value, 10) })} colorClass="bg-blue-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('settings.sectionSpacingGrid')}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{ntg}px</span>
                {ntg !== 24 && <ResetButton onClick={() => updateSectionSpacing({ navToGrid: 24 })} />}
              </div>
            </div>
            <M3Slider min={0} max={64} step={4} value={ntg} onChange={(e) => updateSectionSpacing({ navToGrid: parseInt(e.target.value, 10) })} colorClass="bg-blue-500" />
          </div>
        </Section>

        {/* ── Card Style Section ── */}
        <Section
          id="cards"
          icon={Eye}
          title={t('settings.layoutCards')}
        >
          {/* Border Radius */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('settings.cardRadius')}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{cardBorderRadius}px</span>
                {cardBorderRadius !== 16 && <ResetButton onClick={() => setCardBorderRadius(16)} />}
              </div>
            </div>
            <M3Slider
              min={0}
              max={64}
              step={2}
              value={cardBorderRadius}
              onChange={(e) => setCardBorderRadius(parseInt(e.target.value, 10))}
              colorClass="bg-blue-500"
            />
          </div>
          {/* Transparency */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('settings.transparency')}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{cardTransparency}%</span>
                {cardTransparency !== 40 && <ResetButton onClick={() => setCardTransparency(40)} />}
              </div>
            </div>
            <M3Slider
              min={0}
              max={100}
              step={5}
              value={cardTransparency}
              onChange={(e) => setCardTransparency(parseInt(e.target.value, 10))}
              colorClass="bg-blue-500"
            />
          </div>
          {/* Border Opacity */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('settings.borderOpacity')}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{cardBorderOpacity}%</span>
                {cardBorderOpacity !== 5 && <ResetButton onClick={() => setCardBorderOpacity(5)} />}
              </div>
            </div>
            <M3Slider
              min={0}
              max={50}
              step={5}
              value={cardBorderOpacity}
              onChange={(e) => setCardBorderOpacity(parseInt(e.target.value, 10))}
              colorClass="bg-blue-500"
            />
          </div>
        </Section>
      </div>
    );
  };

  // ─── Updates Tab ───
  const renderUpdatesTab = () => {
    const updates = entities ? Object.keys(entities).filter(id =>
      id.startsWith('update.') && entities[id].state === 'on'
    ).map(id => entities[id]) : [];

    if (updates.length === 0) {
      return (
        <div className="space-y-8 font-sans animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="p-8 rounded-2xl bg-[var(--glass-bg)] text-center">
            <Check className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">{t('updates.none')}</h3>
            <p className="text-sm text-[var(--text-secondary)]">{t('updates.allUpToDate')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3 font-sans animate-in fade-in slide-in-from-right-4 duration-300">
        {updates.map(update => {
          const installedVersion = update.attributes?.installed_version;
          const latestVersion = update.attributes?.latest_version;
          const entityPicture = update.attributes?.entity_picture ? getEntityImageUrl(update.attributes.entity_picture) : null;
          const isInstalling = installingIds[update.entity_id];
          const hasNotes = !!(update.attributes?.release_summary || update.attributes?.release_url);
          const isExpanded = expandedNotes[update.entity_id];

          return (
            <div key={update.entity_id} className="rounded-2xl bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-hover)] transition-all overflow-hidden">
              <div className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[var(--glass-bg-hover)] flex items-center justify-center p-1.5 border border-[var(--glass-border)] flex-shrink-0 relative overflow-hidden">
                    {entityPicture ? (
                      <img src={entityPicture} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Download className="w-5 h-5 text-blue-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {update.attributes?.title || update.attributes?.friendly_name || update.entity_id}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {installedVersion && (
                        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                          <span className="opacity-50 text-[10px] uppercase tracking-wider font-bold">{t('updates.from')}</span>
                          <span className="text-[10px] font-mono bg-[var(--glass-bg)] px-1.5 py-0.5 rounded border border-[var(--glass-border)] opacity-80">{installedVersion}</span>
                        </div>
                      )}
                      {installedVersion && latestVersion && (
                        <ArrowRight className="w-3 h-3 text-[var(--text-muted)] opacity-30" />
                      )}
                      {latestVersion && (
                        <div className="flex items-center gap-1.5 text-green-400">
                          <span className="opacity-50 text-[10px] uppercase tracking-wider font-bold">{t('updates.to')}</span>
                          <span className="text-[10px] font-mono bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20 font-bold">{latestVersion}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Buttons: stack vertically on very small screens */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleSkipUpdate(update.entity_id)}
                      className="px-3 py-2 rounded-xl bg-[var(--glass-bg-hover)] hover:bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[10px] font-bold uppercase tracking-widest transition-all hidden sm:block"
                    >
                      {t('updates.skip')}
                    </button>
                    <button
                      onClick={() => handleInstallUpdate(update.entity_id)}
                      disabled={isInstalling}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                        isInstalling
                          ? 'bg-blue-500/50 text-white/70 cursor-wait'
                          : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-95'
                      }`}
                    >
                      {isInstalling && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {isInstalling ? t('updates.installing') : t('updates.update')}
                    </button>
                  </div>
                </div>

                {/* Mobile skip button */}
                <div className="flex sm:hidden mt-2 justify-end">
                  <button
                    onClick={() => handleSkipUpdate(update.entity_id)}
                    className="px-3 py-1.5 rounded-lg bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest"
                  >
                    {t('updates.skip')}
                  </button>
                </div>
              </div>

              {/* Expandable Release Notes */}
              {hasNotes && (
                <div className="px-4 pb-3">
                  <button
                    onClick={() => setExpandedNotes(prev => ({ ...prev, [update.entity_id]: !prev[update.entity_id] }))}
                    className="text-[10px] text-[var(--accent-color)] hover:text-[var(--text-primary)] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
                  >
                    {isExpanded ? t('updates.showLess') : t('updates.showMore')}
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      {(update.attributes?.release_summary || update.attributes?.body) && (
                        <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed opacity-90 whitespace-pre-wrap font-mono bg-black/20 p-3 rounded-lg max-h-60 overflow-y-auto custom-scrollbar select-text">
                          {update.attributes.release_summary || update.attributes.body}
                        </div>
                      )}
                      {update.attributes?.release_url && (
                        <a
                          href={update.attributes.release_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-[var(--accent-color)] hover:underline mt-2 inline-flex items-center gap-1 font-bold uppercase tracking-wider"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t('updates.readMore')} <ArrowRight className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Main Render ───
  return (
    <div
      className={`fixed inset-0 z-50 flex ${
        isLayoutPreview ? 'items-stretch justify-end' : 'items-center justify-center p-4 md:p-8'
      }`}
      style={{
        backdropFilter: isLayoutPreview ? 'none' : 'blur(20px)',
        backgroundColor: isLayoutPreview ? 'transparent' : 'rgba(0,0,0,0.3)'
      }}
      onClick={handleClose}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
      <div
        className={`border w-full relative font-sans flex flex-col overflow-hidden popup-anim text-[var(--text-primary)] ${
          isLayoutPreview
            ? 'max-w-[18rem] sm:max-w-[21rem] md:max-w-[23rem] h-full rounded-none md:rounded-l-[2.5rem] shadow-2xl origin-right scale-[0.94] sm:scale-[0.97] md:scale-100 animate-in slide-in-from-right-8 fade-in zoom-in-95 duration-300'
            : 'max-w-[96vw] xl:max-w-[1420px] h-[84vh] max-h-[920px] rounded-3xl md:rounded-[3rem] shadow-2xl'
        }`}
        style={{
          background: 'linear-gradient(160deg, var(--card-bg) 0%, var(--modal-bg) 70%)',
          borderColor: 'var(--glass-border)',
          color: 'var(--text-primary)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isOnboardingActive && (
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 z-30 p-2 rounded-full border border-[var(--glass-border)] bg-[var(--card-bg)]/90 hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors backdrop-blur-md shadow-lg"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {isOnboardingActive ? (
          <div className="flex flex-col md:flex-row h-full">
            {/* Onboarding Sidebar */}
            <div className="w-full md:w-64 flex flex-row md:flex-col gap-1 p-3 border-b md:border-b-0 md:border-r border-[var(--glass-border)]">
              <div className="hidden md:flex items-center gap-3 px-3 py-4 mb-2">
                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="font-bold text-lg tracking-wide">{t('onboarding.title')}</span>
              </div>

              {onboardingSteps.map((step, index) => {
                const isActive = onboardingStep === index;
                const isDone = onboardingStep > index;
                const StepIcon = step.icon;
                return (
                  <div
                    key={step.key}
                    className={`flex-1 md:flex-none flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold uppercase tracking-wide cursor-default ${isActive ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : ''} ${isDone ? 'text-green-400 bg-green-500/10' : ''} ${!isActive && !isDone ? 'text-[var(--text-secondary)] opacity-50' : ''}`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                    <span className="hidden md:inline">{step.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Onboarding Content Area */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between p-6 border-b border-[var(--glass-border)] md:hidden">
                <h3 className="font-bold text-lg uppercase tracking-wide">{onboardingSteps[onboardingStep].label}</h3>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-5 custom-scrollbar">
                <div className="hidden md:flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">{onboardingSteps[onboardingStep].label}</h2>
                </div>

                {onboardingStep === 0 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* Auth Method Toggle */}
                    {renderAuthMethodToggle(true)}

                    <div className="space-y-3">
                      {/* URL — always shown */}
                      <div className="space-y-1.5">
                        <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('system.haUrlPrimary')}</label>
                        <input
                          type="text"
                          className={`w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] border-2 text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] text-sm ${onboardingUrlError ? 'border-red-500/50' : 'border-[var(--glass-border)] focus:border-blue-500/50'}`}
                          value={config.url}
                          onChange={(e) => {
                            updatePrimaryConnectionConfig({ url: e.target.value.trim() });
                            setOnboardingUrlError('');
                            setConnectionTestResult(null);
                          }}
                          placeholder={t('onboarding.haUrlPlaceholder')}
                        />
                        {onboardingUrlError && <p className="text-xs text-red-400 font-bold ml-1">{onboardingUrlError}</p>}
                      </div>

                      {/* OAuth2 mode — show login button */}
                      {isOAuth && (
                        <div className="pt-2">
                          {renderOAuthSection()}
                        </div>
                      )}

                      {/* Token mode — show token + fallback */}
                      {!isOAuth && (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('system.token')}</label>
                            <textarea
                              className={`w-full px-3 py-2 h-24 rounded-xl bg-[var(--glass-bg)] border-2 text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] font-mono text-xs leading-tight ${onboardingTokenError ? 'border-red-500/50' : 'border-[var(--glass-border)] focus:border-blue-500/50'}`}
                              value={config.token}
                              onChange={(e) => {
                                updatePrimaryConnectionConfig({ token: e.target.value.trim() });
                                setOnboardingTokenError('');
                                setConnectionTestResult(null);
                              }}
                              placeholder={t('onboarding.tokenPlaceholder')}
                            />
                            {onboardingTokenError && <p className="text-xs text-red-400 font-bold ml-1">{onboardingTokenError}</p>}
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('system.haUrlFallback')}</label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-muted)] text-sm focus:border-blue-500/50"
                              value={config.fallbackUrl}
                              onChange={(e) => updatePrimaryConnectionConfig({ fallbackUrl: e.target.value.trim() })}
                              placeholder={t('common.optional')}
                            />
                            <p className="text-[10px] text-[var(--text-muted)] ml-1 leading-tight">{t('onboarding.fallbackHint')}</p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Test Connection — token mode only */}
                    {!isOAuth && (
                      <>
                        <button
                          onClick={testConnection}
                          disabled={!canManageConnection || !config.url || !config.token || !validateUrl(config.url) || testingConnection}
                          className={`w-full py-2.5 rounded-xl font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg text-sm ${!canManageConnection || !config.url || !config.token || !validateUrl(config.url) || testingConnection ? 'bg-[var(--glass-bg)] text-[var(--text-secondary)] opacity-50 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/20'}`}
                        >
                          {testingConnection ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Wifi className="w-5 h-5" />}
                          {testingConnection ? t('onboarding.testing') : t('onboarding.testConnection')}
                        </button>

                        {connectionTestResult && (
                          <div className={`p-3 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 ${connectionTestResult.success ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                            {connectionTestResult.success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            <span className="font-bold text-sm">{connectionTestResult.message}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {onboardingStep === 1 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-4">
                      <p className="text-xs uppercase font-bold text-gray-500 ml-1">{t('settings.language')}</p>
                      <ModernDropdown label={t('settings.language')} icon={Globe} options={['nn', 'nb', 'en']} current={language} onChange={setLanguage} map={{ nn: t('language.nn'), nb: t('language.nb'), en: t('language.en') }} placeholder={t('dropdown.noneSelected')} />
                    </div>
                    <div className="space-y-4">
                      <p className="text-xs uppercase font-bold text-gray-500 ml-1">{t('settings.theme')}</p>
                      <ModernDropdown label={t('settings.theme')} icon={Palette} options={Object.keys(themes)} current={currentTheme} onChange={setCurrentTheme} map={{ dark: t('theme.dark'), light: t('theme.light') }} placeholder={t('dropdown.noneSelected')} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs uppercase font-bold text-gray-500 ml-1 flex justify-between">
                        {t('settings.inactivity')}
                        <span className="text-[var(--text-primary)]">{inactivityTimeout === 0 ? t('common.off') : `${inactivityTimeout}s`}</span>
                      </label>
                      <div className="px-1 py-2">
                        <M3Slider
                          min={0}
                          max={300}
                          step={10}
                          value={inactivityTimeout}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setInactivityTimeout(val);
                            try { localStorage.setItem('tunet_inactivity_timeout', String(val)); } catch {}
                          }}
                          colorClass="bg-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {onboardingStep === 2 && (
                  <div className="space-y-6 flex flex-col items-center text-center justify-center p-4 animate-in fade-in zoom-in duration-500 h-full">
                    <div className="w-24 h-24 bg-green-500 text-white rounded-full flex items-center justify-center shadow-xl shadow-green-500/30 mb-8">
                      <Check className="w-12 h-12" />
                    </div>
                    <h4 className="text-3xl font-bold text-[var(--text-primary)]">{t('onboarding.finishTitle')}</h4>
                    <p className="text-[var(--text-secondary)] max-w-sm text-lg mt-2">{t('onboarding.finishBody')}</p>
                  </div>
                )}
              </div>

              {/* Onboarding Footer */}
              <div className="p-4 border-t border-[var(--glass-border)] flex gap-3">
                <button
                  onClick={() => setOnboardingStep((s) => Math.max(0, s - 1))}
                  className="flex-1 py-3 rounded-xl text-[var(--text-secondary)] font-bold uppercase tracking-widest border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] transition-colors"
                  disabled={onboardingStep === 0}
                  style={{ opacity: onboardingStep === 0 ? 0 : 1, pointerEvents: onboardingStep === 0 ? 'none' : 'auto' }}
                >
                  {t('onboarding.back')}
                </button>
                {onboardingStep < onboardingSteps.length - 1 ? (
                  <button
                    onClick={() => setOnboardingStep((s) => Math.min(onboardingSteps.length - 1, s + 1))}
                    disabled={!canAdvanceOnboarding}
                    className={`flex-1 py-3 rounded-xl font-bold uppercase tracking-widest transition-all shadow-lg ${canAdvanceOnboarding ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/20' : 'bg-[var(--glass-bg)] text-[var(--text-secondary)] border border-[var(--glass-border)] cursor-not-allowed opacity-50'}`}
                  >
                    {t('onboarding.next')}
                  </button>
                ) : (
                  <button
                    onClick={onFinishOnboarding}
                    className="flex-1 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold uppercase tracking-widest transition-all shadow-lg shadow-green-500/20"
                  >
                    {t('onboarding.finish')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          // ═══ SYSTEM SETTINGS LAYOUT ═══
          <div className={`flex h-full ${isLayoutPreview ? 'flex-col' : 'flex-col md:flex-row'}`}>
            {/* Sidebar — icons only on mobile, full labels on desktop */}
            {!isLayoutPreview && (
              <div className="w-full md:w-56 flex flex-row md:flex-col gap-1 p-2 md:p-3 border-b md:border-b-0 md:border-r border-[var(--glass-border)] flex-shrink-0 bg-[linear-gradient(160deg,var(--glass-bg),transparent_70%)] animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="hidden md:flex items-center gap-3 px-3 py-4 mb-2">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                    <Settings className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-lg tracking-wide">{t('system.title')}</span>
                </div>

                {availableTabs.map(tab => {
                  const active = activeConfigTab === tab.key;
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setConfigTab(tab.key)}
                      className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl transition-all text-sm font-bold uppercase tracking-wide ${
                        active
                          ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <TabIcon className="w-4 h-4 flex-shrink-0" />
                      <span className="hidden md:inline text-xs truncate">{tab.label}</span>
                    </button>
                  );
                })}

                <div className="mt-auto hidden md:flex flex-col gap-2 pt-4 border-t border-[var(--glass-border)]">
                  <button onClick={onClose} className="w-full py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold uppercase tracking-widest transition-all shadow-lg shadow-green-500/20 flex items-center justify-center gap-2 text-sm">
                    <Check className="w-4 h-4" />
                    {t('system.save')}
                  </button>
                  <div className="text-center pt-2">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest opacity-50">
                      Tunet Dashboard v1.6.1
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className={`flex items-center justify-between p-4 border-b border-[var(--glass-border)] ${isLayoutPreview ? 'relative overflow-hidden bg-[var(--glass-bg)]' : 'md:hidden'}`}>
                {isLayoutPreview && (
                  <div className="absolute inset-0 bg-gradient-to-l from-[var(--accent-bg)]/50 via-transparent to-transparent pointer-events-none" />
                )}
                <div className="flex items-center gap-3 relative">
                  <div className="p-2 rounded-lg bg-[var(--accent-bg)] text-[var(--accent-color)] shadow-inner">
                    <LayoutGrid className="w-4 h-4" />
                  </div>
                    <h3 className="font-bold text-base uppercase tracking-wide">
                      {availableTabs.find(tb => tb.key === activeConfigTab)?.label}
                    </h3>
                </div>
                <button onClick={onClose} className="modal-close relative"><X className="w-4 h-4" /></button>
              </div>

              <div className={`flex-1 overflow-y-auto custom-scrollbar ${isLayoutPreview ? 'p-5 md:p-6' : 'p-5 md:p-8 xl:p-10'}`}>
                {/* Desktop Header */}
                {!isLayoutPreview && (
                  <div className="hidden md:flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold">
                      {availableTabs.find(tab => tab.key === activeConfigTab)?.label}
                    </h2>
                    <button onClick={handleClose} className="p-2 rounded-full hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {activeConfigTab === 'connection' && renderConnectionTab()}
                {canAccessNotifications && activeConfigTab === 'notifications' && renderNotificationsTab()}
                {canAccessStorage && activeConfigTab === 'storage' && renderStorageTab()}
                {/* {configTab === 'appearance' && renderAppearanceTab()} */}
                {/* {configTab === 'layout' && renderLayoutTab()} */}
                {canAccessUpdates && activeConfigTab === 'updates' && renderUpdatesTab()}
              </div>

              {/* Mobile Footer */}
              {!isLayoutPreview && (
                <div className="p-3 border-t border-[var(--glass-border)] md:hidden">
                  <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold uppercase tracking-widest transition-all shadow-lg shadow-green-500/20 text-sm">
                    {t('system.save')}
                  </button>
                  <div className="text-center pt-2">
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest opacity-50">
                      Tunet Dashboard v1.6.1
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
