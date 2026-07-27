const STATUS_RANK = {
  healthy: 0,
  configured: 1,
  unknown: 2,
  degraded: 3,
  offline: 4,
};

const hasValue = (value) => Boolean(String(value || '').trim());

const selectWorstStatus = (statuses) => (
  (Array.isArray(statuses) ? statuses : [])
    .filter((status) => Object.hasOwn(STATUS_RANK, status))
    .sort((a, b) => STATUS_RANK[b] - STATUS_RANK[a])[0] || 'unknown'
);

const connectionStatus = (from, to) => {
  if (from === 'offline' || to === 'offline') return 'offline';
  if (from === 'degraded' || to === 'degraded') return 'degraded';
  if (from === 'healthy' && to === 'healthy') return 'healthy';
  if (from === 'configured' || to === 'configured') return 'configured';
  return 'unknown';
};

const node = ({
  id,
  labelKey,
  group,
  icon,
  value = '',
  valueKey = '',
  detail = '',
  detailKey = '',
  status = 'unknown',
  evidenceKey,
  facts = [],
}) => ({
  id,
  labelKey,
  group,
  icon,
  value,
  valueKey,
  detail,
  detailKey,
  status,
  evidenceKey,
  facts,
});

const finalizeMap = (architectureType, nodes, edgeDefinitions, options = {}) => {
  const nodeById = new Map(nodes.map((entry) => [entry.id, entry]));
  const edges = edgeDefinitions.map(([id, from, to, labelKey]) => ({
    id,
    from,
    to,
    labelKey,
    status: connectionStatus(nodeById.get(from)?.status, nodeById.get(to)?.status),
  }));
  const ignoredOperationalNodes = new Set(options.ignoredOperationalNodes || ['equipment']);
  const operationalNodes = nodes.filter((entry) => !ignoredOperationalNodes.has(entry.id));
  const counts = nodes.reduce((result, entry) => ({
    ...result,
    [entry.status]: Number(result[entry.status] || 0) + 1,
  }), {});

  return {
    architectureType,
    nodes,
    edges,
    counts,
    status: selectWorstStatus(operationalNodes.map((entry) => entry.status)),
  };
};

const buildLegacyMqttMap = ({
  site,
  detail,
  knxClient,
}) => {
  const operations = detail?.operations && typeof detail.operations === 'object'
    ? detail.operations
    : {};
  const remoteHealth = operations.remoteHealth || {};
  const backup = operations.backup || {};
  const remoteStatus = String(remoteHealth.status || 'not_monitored');
  const remoteUp = remoteStatus === 'up';
  const remoteDown = remoteStatus === 'down';
  const knxStatus = knxClient?.online
    ? 'healthy'
    : (hasValue(site.knxIp) || hasValue(site.knxMac) ? 'configured' : 'unknown');
  const equipmentStatus = ['healthy', 'configured'].includes(knxStatus) ? 'configured' : 'unknown';
  const cedaloStatus = hasValue(site.mqttBroker) ? 'configured' : 'unknown';
  const topicStatus = hasValue(site.mqttTopicPrefix) ? 'configured' : 'unknown';
  const proxmoxStatus = hasValue(site.proxmoxHost) ? 'configured' : 'unknown';
  const cloudHaStatus = remoteUp
    ? 'healthy'
    : remoteDown
      ? 'offline'
      : hasValue(site.cloudHaHost)
        ? 'configured'
        : 'unknown';
  const domainStatus = remoteUp
    ? 'healthy'
    : remoteDown
      ? 'offline'
      : hasValue(site.domainFqdn)
        ? 'configured'
        : 'unknown';
  const backupStatus = backup.error
    ? 'degraded'
    : backup.directoryExists && Number(backup.fileCount || 0) > 0
      ? 'healthy'
      : backup.directoryExists
        ? 'configured'
        : hasValue(backup.path || site.backupDirectoryPath)
          ? 'configured'
          : 'unknown';

  const nodes = [
    node({
      id: 'equipment',
      labelKey: 'superAdminNetwork.systemMap.node.equipment',
      group: 'field',
      icon: 'activity',
      valueKey: 'superAdminNetwork.systemMap.equipmentShort',
      status: equipmentStatus,
      evidenceKey: 'superAdminNetwork.systemMap.evidence.gatewayOnly',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.equipment', valueKey: 'superAdminNetwork.systemMap.equipmentList' },
      ],
    }),
    node({
      id: 'knx',
      labelKey: 'superAdminNetwork.systemMap.node.knxMqtt',
      group: 'site',
      icon: 'zap',
      value: site.knxIp || '',
      detail: site.knxMac || knxClient?.name || '',
      status: knxStatus,
      evidenceKey: knxClient?.online
        ? 'superAdminNetwork.systemMap.evidence.clientObserved'
        : 'superAdminNetwork.systemMap.evidence.savedConfiguration',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.lanIp', value: site.knxIp || knxClient?.ipAddress || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.mac', value: site.knxMac || knxClient?.macAddress || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.transport', value: 'MQTT' },
      ],
    }),
    node({
      id: 'cedalo',
      labelKey: 'superAdminNetwork.systemMap.node.cedalo',
      group: 'external',
      icon: 'cloud',
      value: site.mqttBroker || '',
      detailKey: 'superAdminNetwork.systemMap.mqttBroker',
      status: cedaloStatus,
      evidenceKey: 'superAdminNetwork.systemMap.evidence.mqttConfigurationOnly',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.broker', value: site.mqttBroker || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.monitoring', valueKey: 'superAdminNetwork.systemMap.notLiveMonitored' },
      ],
    }),
    node({
      id: 'mqttTopics',
      labelKey: 'superAdminNetwork.systemMap.node.mqttTopics',
      group: 'external',
      icon: 'radio',
      value: site.mqttTopicPrefix || '',
      detailKey: 'superAdminNetwork.systemMap.subscriptionScope',
      status: topicStatus,
      evidenceKey: 'superAdminNetwork.systemMap.evidence.topicConfigured',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.topicPrefix', value: site.mqttTopicPrefix || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.subscription', valueKey: 'superAdminNetwork.systemMap.subscriptionPerSite' },
      ],
    }),
    node({
      id: 'proxmox',
      labelKey: 'superAdminNetwork.systemMap.node.proxmox',
      group: 'server',
      icon: 'server',
      value: site.proxmoxHost || '',
      detailKey: 'superAdminNetwork.systemMap.virtualizationHost',
      status: proxmoxStatus,
      evidenceKey: 'superAdminNetwork.systemMap.evidence.savedConfiguration',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.host', value: site.proxmoxHost || '' },
      ],
    }),
    node({
      id: 'cloudHa',
      labelKey: 'superAdminNetwork.systemMap.node.cloudHa',
      group: 'server',
      icon: 'cpu',
      value: site.cloudHaHost || '',
      detail: remoteHealth.host || '',
      status: cloudHaStatus,
      evidenceKey: remoteUp
        ? 'superAdminNetwork.systemMap.evidence.remoteVerified'
        : remoteDown
          ? 'superAdminNetwork.systemMap.evidence.remoteFailed'
          : 'superAdminNetwork.systemMap.evidence.savedConfiguration',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.host', value: site.cloudHaHost || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.checkedUrl', value: remoteHealth.checkedUrl || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.lastChecked', value: remoteHealth.lastCheckedAt || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.error', value: remoteHealth.error || '' },
      ],
    }),
    node({
      id: 'domain',
      labelKey: 'superAdminNetwork.systemMap.node.domain',
      group: 'external',
      icon: 'globe',
      value: site.domainFqdn || '',
      detail: remoteHealth.host || '',
      status: domainStatus,
      evidenceKey: remoteUp
        ? 'superAdminNetwork.systemMap.evidence.remoteVerified'
        : remoteDown
          ? 'superAdminNetwork.systemMap.evidence.remoteFailed'
          : 'superAdminNetwork.systemMap.evidence.notMonitored',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.checkedUrl', value: remoteHealth.checkedUrl || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.lastChecked', value: remoteHealth.lastCheckedAt || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.error', value: remoteHealth.error || '' },
      ],
    }),
    node({
      id: 'backup',
      labelKey: 'superAdminNetwork.systemMap.node.backup',
      group: 'server',
      icon: 'archive',
      value: Number(backup.fileCount || 0),
      detailKey: 'superAdminNetwork.systemMap.filesStored',
      status: backupStatus,
      evidenceKey: backup.error
        ? 'superAdminNetwork.systemMap.evidence.backupFailed'
        : backup.directoryExists
          ? 'superAdminNetwork.systemMap.evidence.backupObserved'
          : 'superAdminNetwork.systemMap.evidence.savedConfiguration',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.backupPath', value: backup.path || site.backupDirectoryPath || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.backupFiles', value: Number(backup.fileCount || 0) },
        { labelKey: 'superAdminNetwork.systemMap.fact.latestBackup', value: backup.latestBackupAt || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.storage', value: Number(backup.totalBytes || 0), format: 'bytes' },
        { labelKey: 'superAdminNetwork.systemMap.fact.error', value: backup.error || '' },
      ],
    }),
  ];

  return finalizeMap('legacy_mqtt', nodes, [
    ['equipment-knx', 'equipment', 'knx', 'superAdminNetwork.systemMap.link.knxBus'],
    ['knx-cedalo', 'knx', 'cedalo', 'superAdminNetwork.systemMap.link.mqttPublish'],
    ['cedalo-topics', 'cedalo', 'mqttTopics', 'superAdminNetwork.systemMap.link.topicRoute'],
    ['topics-cloud-ha', 'mqttTopics', 'cloudHa', 'superAdminNetwork.systemMap.link.mqttSubscribe'],
    ['proxmox-cloud-ha', 'proxmox', 'cloudHa', 'superAdminNetwork.systemMap.link.virtualMachine'],
    ['cloud-ha-domain', 'cloudHa', 'domain', 'superAdminNetwork.systemMap.link.https'],
    ['cloud-ha-backup', 'cloudHa', 'backup', 'superAdminNetwork.systemMap.link.sftp'],
  ], {
    ignoredOperationalNodes: ['equipment', 'mqttTopics'],
  });
};

export const buildNetworkSystemMap = ({
  site = {},
  overview = {},
  detail = {},
  mobilitySummary = null,
  mobilitySnapshot = null,
  hubClient = null,
  knxClient = null,
} = {}) => {
  if (site?.architectureType === 'legacy_mqtt') {
    return buildLegacyMqttMap({
      site,
      detail,
      knxClient,
    });
  }

  const runtime = site?.runtime && typeof site.runtime === 'object'
    ? site.runtime
    : detail?.site?.runtime || {};
  const operations = detail?.operations && typeof detail.operations === 'object'
    ? detail.operations
    : {};
  const remoteHealth = operations.remoteHealth || {};
  const backup = operations.backup || {};
  const mobilityDevice = mobilitySnapshot?.device || {};
  const umrOnline = Boolean(mobilityDevice.online || mobilitySummary?.online);
  const remoteStatus = String(remoteHealth.status || 'not_monitored');
  const remoteUp = remoteStatus === 'up';
  const remoteDown = remoteStatus === 'down';

  const cellularStatus = umrOnline
    ? 'healthy'
    : (mobilitySummary || site.mobilityDeviceId ? 'configured' : 'unknown');
  const umrStatus = umrOnline
    ? 'healthy'
    : (hasValue(site.routerIp || site.umrLanIp) || hasValue(site.umrMac) ? 'configured' : 'unknown');
  const wireGuardStatus = runtime.wireGuardDrifted
    ? 'degraded'
    : runtime.wireGuardHandshakeRecent
      ? 'healthy'
      : runtime.wireGuardRuntimeAvailable && runtime.wireGuardApplied
        ? (runtime.wireGuardHandshakeAt ? 'degraded' : 'offline')
        : runtime.wireGuardApplied
          ? 'configured'
          : (hasValue(site.tunnelIp) && site.hasWireGuardKeys ? 'configured' : 'unknown');
  const serverStatus = 'healthy';
  const caddyStatus = runtime.caddyDrifted
    ? 'degraded'
    : remoteUp && runtime.caddyApplied
      ? 'healthy'
      : remoteDown && runtime.caddyApplied
        ? 'offline'
        : runtime.caddyApplied
          ? 'configured'
          : (hasValue(site.domainFqdn) ? 'configured' : 'unknown');
  const domainStatus = remoteUp
    ? 'healthy'
    : remoteDown
      ? 'offline'
      : (hasValue(site.domainFqdn) ? 'configured' : 'unknown');
  const hubStatus = remoteUp || hubClient?.online
    ? 'healthy'
    : remoteDown && umrOnline
      ? 'offline'
      : (hasValue(site.haIp) || hasValue(site.haMac) ? 'configured' : 'unknown');
  const knxStatus = knxClient?.online
    ? 'healthy'
    : (hasValue(site.knxIp) || hasValue(site.knxMac) ? 'configured' : 'unknown');
  const equipmentStatus = knxStatus === 'healthy' || knxStatus === 'configured'
    ? 'configured'
    : 'unknown';
  const backupStatus = backup.error
    ? 'degraded'
    : backup.directoryExists && Number(backup.fileCount || 0) > 0
      ? 'healthy'
      : backup.directoryExists
        ? 'configured'
        : (hasValue(backup.path || site.backupDirectoryPath) ? 'configured' : 'unknown');

  const nodes = [
    node({
      id: 'cellular',
      labelKey: 'superAdminNetwork.systemMap.node.cellular',
      group: 'site',
      icon: 'radio',
      value: mobilityDevice.cellular?.carrier || '4G / LTE',
      detail: mobilityDevice.cellular?.technology
        || mobilityDevice.cellular?.signal
        || mobilityDevice.wan?.ipAddress
        || '',
      status: cellularStatus,
      evidenceKey: umrOnline
        ? 'superAdminNetwork.systemMap.evidence.mobilityObserved'
        : 'superAdminNetwork.systemMap.evidence.mobilityConfigured',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.carrier', value: mobilityDevice.cellular?.carrier || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.signal', value: mobilityDevice.cellular?.rsrp || mobilityDevice.cellular?.rssi || mobilityDevice.cellular?.signal || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.wan', value: mobilityDevice.wan?.ipAddress || '' },
      ],
    }),
    node({
      id: 'umr',
      labelKey: 'superAdminNetwork.systemMap.node.umr',
      group: 'site',
      icon: 'router',
      value: mobilitySummary?.name || mobilityDevice.name || site.routerIp || site.umrLanIp || '',
      detail: site.umrMac || site.lanSubnet || '',
      status: umrStatus,
      evidenceKey: umrOnline
        ? 'superAdminNetwork.systemMap.evidence.mobilityObserved'
        : 'superAdminNetwork.systemMap.evidence.savedConfiguration',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.lanIp', value: site.routerIp || site.umrLanIp || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.mac', value: site.umrMac || mobilitySummary?.macAddress || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.lastSeen', value: mobilitySummary?.lastSeenAt || mobilityDevice.lastSeenAt || '' },
      ],
    }),
    node({
      id: 'wireguard',
      labelKey: 'superAdminNetwork.systemMap.node.wireGuard',
      group: 'tunnel',
      icon: 'shield',
      value: site.tunnelIp || '',
      detail: runtime.wireGuardHandshakeAt || '',
      status: wireGuardStatus,
      evidenceKey: runtime.wireGuardDrifted
        ? 'superAdminNetwork.systemMap.evidence.runtimeDrift'
        : runtime.wireGuardHandshakeRecent
        ? 'superAdminNetwork.systemMap.evidence.handshakeVerified'
        : runtime.wireGuardRuntimeAvailable
          ? 'superAdminNetwork.systemMap.evidence.handshakeMissing'
          : 'superAdminNetwork.systemMap.evidence.configurationOnly',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.tunnelIp', value: site.tunnelIp || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.lastHandshake', value: runtime.wireGuardHandshakeAt || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.received', value: Number(runtime.wireGuardTransferRxBytes || 0), format: 'bytes' },
        { labelKey: 'superAdminNetwork.systemMap.fact.sent', value: Number(runtime.wireGuardTransferTxBytes || 0), format: 'bytes' },
      ],
    }),
    node({
      id: 'server',
      labelKey: 'superAdminNetwork.systemMap.node.server',
      group: 'server',
      icon: 'server',
      value: overview?.server?.publicHost || '',
      detail: overview?.server?.wireGuardListenPort
        ? `UDP ${overview.server.wireGuardListenPort}`
        : '',
      status: serverStatus,
      evidenceKey: 'superAdminNetwork.systemMap.evidence.apiResponding',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.publicHost', value: overview?.server?.publicHost || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.listenPort', value: overview?.server?.wireGuardListenPort || '' },
      ],
    }),
    node({
      id: 'caddy',
      labelKey: 'superAdminNetwork.systemMap.node.caddy',
      group: 'server',
      icon: 'globe',
      value: site.domainFqdn || '',
      detail: site.haIp ? `${site.haIp}:8123` : '',
      status: caddyStatus,
      evidenceKey: runtime.caddyDrifted
        ? 'superAdminNetwork.systemMap.evidence.runtimeDrift'
        : remoteDown
          ? 'superAdminNetwork.systemMap.evidence.remoteFailed'
          : remoteUp
            ? 'superAdminNetwork.systemMap.evidence.remoteVerified'
            : runtime.caddyApplied
              ? 'superAdminNetwork.systemMap.evidence.configurationOnly'
              : 'superAdminNetwork.systemMap.evidence.savedConfiguration',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.domain', value: site.domainFqdn || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.upstream', value: site.haIp ? `${site.haIp}:8123` : '' },
      ],
    }),
    node({
      id: 'domain',
      labelKey: 'superAdminNetwork.systemMap.node.domain',
      group: 'external',
      icon: 'cloud',
      value: site.domainFqdn || '',
      detail: remoteHealth.host || '',
      status: domainStatus,
      evidenceKey: remoteUp
        ? 'superAdminNetwork.systemMap.evidence.remoteVerified'
        : remoteDown
          ? 'superAdminNetwork.systemMap.evidence.remoteFailed'
          : 'superAdminNetwork.systemMap.evidence.notMonitored',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.checkedUrl', value: remoteHealth.checkedUrl || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.lastChecked', value: remoteHealth.lastCheckedAt || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.error', value: remoteHealth.error || '' },
      ],
    }),
    node({
      id: 'hub',
      labelKey: 'superAdminNetwork.systemMap.node.hub',
      group: 'site',
      icon: 'cpu',
      value: site.haIp || '',
      detail: site.haMac || hubClient?.name || '',
      status: hubStatus,
      evidenceKey: remoteUp
        ? 'superAdminNetwork.systemMap.evidence.remoteVerified'
        : hubClient?.online
          ? 'superAdminNetwork.systemMap.evidence.clientObserved'
          : remoteDown
            ? 'superAdminNetwork.systemMap.evidence.remoteFailed'
            : 'superAdminNetwork.systemMap.evidence.savedConfiguration',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.lanIp', value: site.haIp || hubClient?.ipAddress || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.mac', value: site.haMac || hubClient?.macAddress || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.clientName', value: hubClient?.name || '' },
      ],
    }),
    node({
      id: 'knx',
      labelKey: 'superAdminNetwork.systemMap.node.knx',
      group: 'site',
      icon: 'zap',
      value: site.knxIp || '',
      detail: site.knxMac || knxClient?.name || '',
      status: knxStatus,
      evidenceKey: knxClient?.online
        ? 'superAdminNetwork.systemMap.evidence.clientObserved'
        : 'superAdminNetwork.systemMap.evidence.savedConfiguration',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.lanIp', value: site.knxIp || knxClient?.ipAddress || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.mac', value: site.knxMac || knxClient?.macAddress || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.clientName', value: knxClient?.name || '' },
      ],
    }),
    node({
      id: 'equipment',
      labelKey: 'superAdminNetwork.systemMap.node.equipment',
      group: 'field',
      icon: 'activity',
      valueKey: 'superAdminNetwork.systemMap.equipmentShort',
      detail: '',
      status: equipmentStatus,
      evidenceKey: 'superAdminNetwork.systemMap.evidence.gatewayOnly',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.equipment', valueKey: 'superAdminNetwork.systemMap.equipmentList' },
      ],
    }),
    node({
      id: 'backup',
      labelKey: 'superAdminNetwork.systemMap.node.backup',
      group: 'server',
      icon: 'archive',
      value: Number(backup.fileCount || 0),
      detailKey: 'superAdminNetwork.systemMap.filesStored',
      status: backupStatus,
      evidenceKey: backup.error
        ? 'superAdminNetwork.systemMap.evidence.backupFailed'
        : backup.directoryExists
          ? 'superAdminNetwork.systemMap.evidence.backupObserved'
          : 'superAdminNetwork.systemMap.evidence.savedConfiguration',
      facts: [
        { labelKey: 'superAdminNetwork.systemMap.fact.backupPath', value: backup.path || site.backupDirectoryPath || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.backupFiles', value: Number(backup.fileCount || 0) },
        { labelKey: 'superAdminNetwork.systemMap.fact.latestBackup', value: backup.latestBackupAt || '' },
        { labelKey: 'superAdminNetwork.systemMap.fact.storage', value: Number(backup.totalBytes || 0), format: 'bytes' },
        { labelKey: 'superAdminNetwork.systemMap.fact.error', value: backup.error || '' },
      ],
    }),
  ];

  return finalizeMap('edge_hub', nodes, [
    ['cellular-umr', 'cellular', 'umr', 'superAdminNetwork.systemMap.link.mobile'],
    ['umr-hub', 'umr', 'hub', 'superAdminNetwork.systemMap.link.lan'],
    ['hub-knx', 'hub', 'knx', 'superAdminNetwork.systemMap.link.knxIp'],
    ['knx-equipment', 'knx', 'equipment', 'superAdminNetwork.systemMap.link.knxBus'],
    ['umr-wireguard', 'umr', 'wireguard', 'superAdminNetwork.systemMap.link.encrypted'],
    ['wireguard-server', 'wireguard', 'server', 'superAdminNetwork.systemMap.link.peer'],
    ['server-caddy', 'server', 'caddy', 'superAdminNetwork.systemMap.link.proxy'],
    ['caddy-domain', 'caddy', 'domain', 'superAdminNetwork.systemMap.link.https'],
    ['server-backup', 'server', 'backup', 'superAdminNetwork.systemMap.link.sftp'],
  ]);
};
