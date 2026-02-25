import { Edit2 } from '../icons';
import StatusPill from '../components/cards/StatusPill';
import { useNotifications } from '../contexts';

/**
 * StatusBar component showing various status indicators
 * @param {Object} props
 * @param {Object} props.entities - Home Assistant entities
 * @param {Date} props.now - Current time
 * @param {Function} props.setActiveMediaId - Set active media player
 * @param {Function} props.setActiveMediaGroupKey - Set media group key
 * @param {Function} props.setActiveMediaModal - Set active media modal
 * @param {Function} props.setShowUpdateModal - Open update modal
 * @param {Function} props.onOpenEntityPill - Open modal for a specific entity id
 * @param {Function} props.t - Translation function
 * @param {Function} props.isSonosActive - Check if Sonos is active
 * @param {Function} props.isMediaActive - Check if media is active
 * @param {Function} props.getA - Get entity attribute
 * @param {Function} props.getEntityImageUrl - Get entity image URL
 * @param {Array} props.statusPillsConfig - Status pills configuration
 * @param {Function} props.setShowPopupCardModal - Open popup card modal
 */
export default function StatusBar({ 
  entities, 
  _now,
  setActiveMediaId,
  setActiveMediaGroupKey,
  setActiveMediaGroupIds,
  setActiveMediaSessionSensorIds,
  setActiveMediaModal,
  setShowUpdateModal,
  onOpenEntityPill,
  setShowStatusPillsConfig,
  editMode,
  t, 
  isSonosActive, 
  isMediaActive, 
  getA, 
  getEntityImageUrl, 
  statusPillsConfig = [],
  isMobile = false,
  setShowPopupCardModal
}) {
  const { notificationHistory = [] } = useNotifications();

  const isSonosEntity = (entity) => {
    if (!entity) return false;
    const id = entity.entity_id || '';
    const name = (entity.attributes?.friendly_name || '').toLowerCase();
    const manufacturer = (entity.attributes?.manufacturer || '').toLowerCase();
    const platform = (entity.attributes?.platform || '').toLowerCase();
    return id.includes('sonos') || name.includes('sonos') || manufacturer.includes('sonos') || platform.includes('sonos');
  };

  const getSonosEntities = () => Object.keys(entities)
    .filter(id => id.startsWith('media_player.'))
    .map(id => entities[id])
    .filter(isSonosEntity);

  const normalizePattern = (pattern) => pattern.trim();

  const buildWildcardRegex = (pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const wildcard = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${wildcard}$`, 'i');
  };

  const matchesMediaFilter = (id, filter, mode) => {
    if (!filter) return true;
    const patterns = filter
      .split(',')
      .map(normalizePattern)
      .filter(Boolean);
    if (patterns.length === 0) return true;

    return patterns.some((pattern) => {
      if (mode === 'regex') {
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(id);
        } catch {
          return false;
        }
      }

      if (pattern.includes('*')) {
        const wildcardRegex = buildWildcardRegex(pattern);
        return wildcardRegex.test(id);
      }

      if (mode === 'contains') return id.toLowerCase().includes(pattern.toLowerCase());
      return id.toLowerCase().startsWith(pattern.toLowerCase());
    });
  };

  const normalizedNotificationHistory = Array.isArray(notificationHistory) ? notificationHistory : [];

  const countByLevel = (levelMatcher) => normalizedNotificationHistory.reduce((acc, entry) => {
    const level = String(entry?.level || '').trim().toLowerCase();
    return levelMatcher(level) ? acc + 1 : acc;
  }, 0);

  const notificationCriticalCount = countByLevel((level) => level === 'critical' || level === 'error');
  const notificationWarningCount = countByLevel((level) => level === 'warning');
  const notificationSuccessCount = countByLevel((level) => level === 'success');
  const notificationInfoCount = countByLevel((level) => !['critical', 'error', 'warning', 'success'].includes(level));
  const notificationTotalCount = normalizedNotificationHistory.length;

  const notificationSummaryText = (() => {
    if (notificationCriticalCount > 0) {
      return `${notificationCriticalCount} ${t('notificationTimeline.filter.severity.critical')}`;
    }
    if (notificationWarningCount > 0) {
      return `${notificationWarningCount} ${t('notificationTimeline.filter.severity.warning')}`;
    }
    if (notificationTotalCount > 0) {
      return `${notificationTotalCount} ${t('notificationTimeline.entries')}`;
    }
    return `0 ${t('notificationTimeline.entries')}`;
  })();

  const notificationSeverity = notificationCriticalCount > 0
    ? 'critical'
    : notificationWarningCount > 0
      ? 'warning'
      : 'info';

  const notificationSummaryEntity = {
    entity_id: 'notification.timeline',
    state: String(notificationTotalCount),
    attributes: {
      friendly_name: t('notificationTimeline.title'),
      summary_text: notificationSummaryText,
      severity: notificationSeverity,
      entries_count: notificationTotalCount,
      critical_count: notificationCriticalCount,
      warning_count: notificationWarningCount,
      success_count: notificationSuccessCount,
      info_count: notificationInfoCount,
    },
  };

  return (
    <div className={`flex items-center w-full mt-0 font-sans ${isMobile ? 'justify-center' : 'justify-between'}`}>
      <div className={`flex flex-wrap items-center min-w-0 ${isMobile ? 'gap-1.5' : 'gap-2.5'}`}>
        {/* Edit button (only in edit mode) - at first position */}
        {editMode && (
          <button
            onClick={() => setShowStatusPillsConfig(true)}
            className={`flex items-center gap-1.5 rounded-full border transition-all bg-blue-500/20 border-blue-500/30 text-blue-400 hover:bg-blue-500/30 ${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1'}`}
            title={t('statusBar.editPills')}
          >
            <Edit2 className="w-3 h-3" />
            <span className="text-[10px] uppercase font-bold tracking-[0.2em]">{t('statusBar.pills')}</span>
          </button>
        )}
        
        {/* Configurable status pills */}
        {statusPillsConfig
          .filter(pill => pill.visible !== false)
          .map(pill => {
            // Handle different pill types
            if (pill.type === 'media_player' || pill.type === 'emby') {
              const mediaIds = (() => {
                if (pill.type === 'media_player') {
                  return pill.entityId
                    ? [pill.entityId]
                    : Object.keys(entities)
                        .filter(id => id.startsWith('media_player.'))
                        .filter(id => matchesMediaFilter(id, pill.mediaFilter, pill.mediaFilterMode));
                }

                if (Array.isArray(pill.mediaEntityIds) && pill.mediaEntityIds.length > 0) {
                  return pill.mediaEntityIds;
                }

                return Object.keys(entities)
                  .filter(id => id.startsWith('media_player.'))
                  .filter(id => matchesMediaFilter(id, pill.mediaFilter, pill.mediaFilterMode));
              })();
              const mediaEntities = mediaIds.map(id => entities[id]).filter(Boolean);
              const playingCount = mediaEntities.filter(e => e.state === 'playing').length;
              
              return (
                <StatusPill
                  key={pill.id}
                  entity={mediaEntities}
                  pill={pill}
                  getA={getA}
                  getEntityImageUrl={getEntityImageUrl}
                  isMediaActive={isMediaActive}
                  t={t}
                  isMobile={isMobile}
                  badge={pill.type === 'emby' && playingCount >= 2 ? playingCount : undefined}
                  onClick={pill.clickable ? () => {
                    const activeEntities = mediaEntities.filter(isMediaActive);
                    const firstActive = activeEntities[0] || mediaEntities[0];
                    if (!firstActive) return;
                    setActiveMediaId(firstActive.entity_id);
                    setActiveMediaGroupKey(null);
                    setActiveMediaGroupIds(mediaIds);
                    if (pill.type === 'emby' && Array.isArray(pill.sessionSensorIds)) {
                      setActiveMediaSessionSensorIds(pill.sessionSensorIds);
                    } else {
                      setActiveMediaSessionSensorIds(null);
                    }
                    setActiveMediaModal('media');
                  } : undefined}
                />
              );
            }
            
            if (pill.type === 'sonos') {
              const sonosEntities = getSonosEntities();
              
              return (
                <StatusPill
                  key={pill.id}
                  entity={sonosEntities}
                  pill={pill}
                  getA={getA}
                  getEntityImageUrl={getEntityImageUrl}
                  isMediaActive={isSonosActive}
                  t={t}
                  isMobile={isMobile}
                  onClick={pill.clickable ? () => {
                    setActiveMediaModal('sonos');
                  } : undefined}
                />
              );
            }

            if (pill.type === 'notification_timeline') {
              const resolvedPill = {
                ...pill,
                icon: pill.icon || 'Bell',
                label: pill.label || t('notificationTimeline.title'),
                sublabel: pill.sublabel || notificationSummaryText,
                clickable: pill.clickable !== false,
              };

              return (
                <StatusPill
                  key={pill.id}
                  entity={notificationSummaryEntity}
                  pill={resolvedPill}
                  getA={getA}
                  t={t}
                  isMobile={isMobile}
                  badge={notificationTotalCount > 0 ? notificationTotalCount : undefined}
                  onClick={resolvedPill.clickable ? () => {
                    setShowPopupCardModal?.({
                      targetCardId: 'notification_timeline_card_status_pill',
                      sourceCardId: pill.id,
                      buttonLabel: resolvedPill.label || t('notificationTimeline.title'),
                    });
                  } : undefined}
                />
              );
            }
            
            // Default conditional pill
            return (
              <StatusPill
                key={pill.id}
                entity={entities[pill.entityId]}
                pill={pill}
                getA={getA}
                t={t}
                isMobile={isMobile}
                onClick={pill.clickable ? () => {
                  if (!pill.entityId) return;
                  if (pill.entityId.startsWith('update.')) {
                    setShowUpdateModal?.();
                    return;
                  }
                  onOpenEntityPill?.(pill.entityId);
                } : undefined}
              />
            );
          })
        }
      </div>
    </div>
  );
}
