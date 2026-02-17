import {
  AlertTriangle,
  ArrowLeftRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Speaker,
  Tv
} from '../../icons';

/* ─── Single media player card ─── */

export const MediaPlayerCard = ({
  mpId,
  dragProps,
  controls,
  cardStyle,
  entities,
  editMode,
  customNames,
  getA,
  getEntityImageUrl,
  callService,
  isMediaActive,
  onOpen,
  t
}) => {
  const entity = entities[mpId];
  if (!entity) {
    if (editMode) {
      return (
        <div key={mpId} {...dragProps} className="touch-feedback relative rounded-3xl overflow-hidden bg-[var(--card-bg)] border border-dashed border-red-500/50 flex flex-col items-center justify-center p-4 h-full" style={cardStyle}>
          {controls}
          <AlertTriangle className="w-8 h-8 text-red-500 mb-2 opacity-80" />
          <p className="text-xs font-bold text-red-500 text-center uppercase tracking-widest">{t('common.missing')}</p>
          <p className="text-[10px] text-red-400/70 text-center mt-1 font-mono break-all line-clamp-2">{mpId}</p>
        </div>
      );
    }
    return null;
  }

  const mpState = entity?.state;
  const isPlaying = mpState === 'playing';
  const isActive = isMediaActive(entity);
  const name = customNames[mpId] || getA(mpId, 'friendly_name', 'Media Player');
  const title = getA(mpId, 'media_title') || (isActive ? t('status.active') : t('media.noneMedia'));
  const subtitle = getA(mpId, 'media_artist') || getA(mpId, 'media_series_title') || getA(mpId, 'media_album_name') || '';
  const picture = getEntityImageUrl(entity?.attributes?.entity_picture);
  const isChannel = getA(mpId, 'media_content_type') === 'channel';

  if (!isActive) {
    return (
      <div key={mpId} {...dragProps} data-haptic={editMode ? undefined : 'card'} onClick={(e) => { e.stopPropagation(); if (!editMode) onOpen(mpId, null, null); }} className={`touch-feedback p-7 rounded-3xl flex flex-col justify-center items-center transition-all duration-500 border group relative overflow-hidden font-sans h-full ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`} style={{...cardStyle, color: 'var(--text-primary)'}}>
        {controls}
        <div className="p-5 rounded-full mb-4" style={{backgroundColor: 'var(--glass-bg)'}}>
          {isChannel ? <Tv className="w-8 h-8 text-[var(--text-secondary)]" /> : <Speaker className="w-8 h-8 text-[var(--text-secondary)]" />}
        </div>
        <div className="text-center w-full px-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] opacity-60">{t('media.noneMusic')}</p>
          <div className="flex items-center justify-center gap-2 mt-1"><p className="text-xs uppercase tracking-widest text-[var(--text-muted)] opacity-40 truncate">{name}</p></div>
        </div>
      </div>
    );
  }

  return (
    <div key={mpId} {...dragProps} data-haptic={editMode ? undefined : 'card'} onClick={(e) => { e.stopPropagation(); if (!editMode) onOpen(mpId, null, null); }} className={`touch-feedback p-7 rounded-3xl flex flex-col justify-between transition-all duration-500 border group relative overflow-hidden font-sans h-full ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`} style={{...cardStyle, color: picture ? 'white' : 'var(--text-primary)'}}>
      {controls}
      {picture && (
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <img src={picture} alt="" className={`w-full h-full object-cover blur-xl scale-150 transition-transform duration-[10s] ease-in-out ${isPlaying ? 'scale-[1.6]' : 'scale-150'}`} />
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}
      <div className="relative z-10 flex gap-4 items-start">
        <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-lg">
          {picture ? <img src={picture} alt="Cover" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">{isChannel ? <Tv className="w-8 h-8 text-[var(--text-secondary)]" /> : <Speaker className="w-8 h-8 text-[var(--text-secondary)]" />}</div>}
        </div>
        <div className="flex flex-col overflow-hidden pt-1">
          <div className="flex items-center gap-2 mb-1"><p className="text-xs font-bold uppercase tracking-widest text-blue-400 truncate">{name}</p></div>
          <h3 className="text-lg font-bold leading-tight truncate mb-0.5">{title || t('common.unknown')}</h3>
          {subtitle && <p className={`${picture ? 'text-gray-400' : 'text-[var(--text-secondary)]'} text-xs truncate font-medium`}>{subtitle}</p>}
        </div>
      </div>
      <div className="relative z-10 flex items-center justify-center gap-8 mt-2">
        <button onClick={(e) => { e.stopPropagation(); callService("media_player", "media_previous_track", { entity_id: mpId }); }} className={`${picture ? 'text-gray-400 hover:text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'} transition-colors p-2 active:scale-90`}><SkipBack className="w-6 h-6" /></button>
        <button onClick={(e) => { e.stopPropagation(); callService("media_player", "media_play_pause", { entity_id: mpId }); }} className="w-12 h-12 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform shadow-lg active:scale-95">{isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}</button>
        <button onClick={(e) => { e.stopPropagation(); callService("media_player", "media_next_track", { entity_id: mpId }); }} className={`${picture ? 'text-gray-400 hover:text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'} transition-colors p-2 active:scale-90`}><SkipForward className="w-6 h-6" /></button>
      </div>
    </div>
  );
};

/* ─── Media group card (multiple players) ─── */

export const MediaGroupCard = ({
  cardId,
  dragProps,
  controls,
  cardStyle,
  entities,
  editMode,
  cardSettings,
  settingsKey,
  customNames,
  getA,
  getEntityImageUrl,
  callService,
  isMediaActive,
  saveCardSetting,
  onOpen,
  t
}) => {
  const groupSettings = cardSettings[settingsKey] || {};
  const mediaIds = Array.isArray(groupSettings.mediaIds) ? groupSettings.mediaIds : [];
  const mediaEntities = mediaIds.map(id => entities[id]).filter(Boolean);

  if (mediaEntities.length === 0) return null;

  const activeEntities = mediaEntities.filter(isMediaActive);
  const playingEntities = mediaEntities.filter(e => e.state === 'playing');
  const pool = activeEntities.length > 0 ? activeEntities : mediaEntities;
  const cyclePool = playingEntities.length > 1 ? playingEntities : (activeEntities.length > 1 ? activeEntities : pool);

  let currentMp = pool.find(e => e.entity_id === groupSettings.activeId);
  if (!currentMp) currentMp = (playingEntities[0] || pool[0]);
  if (!currentMp) return null;

  const mpId = currentMp.entity_id;
  const mpState = currentMp.state;
  const isPlaying = mpState === 'playing';
  const isActive = activeEntities.length > 0;
  const name = customNames[cardId] || getA(mpId, 'friendly_name', 'Musikk');
  const title = getA(mpId, 'media_title') || (isActive ? t('status.active') : t('media.noneMusic'));
  const subtitle = getA(mpId, 'media_artist') || getA(mpId, 'media_series_title') || getA(mpId, 'media_album_name') || '';
  const picture = getEntityImageUrl(currentMp.attributes?.entity_picture);
  const isChannel = getA(mpId, 'media_content_type') === 'channel';

  const cyclePlayers = (e) => {
    e.stopPropagation();
    if (cyclePool.length < 2) return;
    const idx = cyclePool.findIndex(ent => ent.entity_id === mpId);
    const next = cyclePool[(idx + 1) % cyclePool.length];
    saveCardSetting(settingsKey, 'activeId', next.entity_id);
  };

  if (!isActive) {
    return (
      <div key={cardId} {...dragProps} data-haptic={editMode ? undefined : 'card'} onClick={(e) => { e.stopPropagation(); if (!editMode) onOpen(mpId, settingsKey, null); }} className={`touch-feedback p-7 rounded-3xl flex flex-col justify-center items-center transition-all duration-500 border group relative overflow-hidden font-sans h-full ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`} style={{...cardStyle, color: 'var(--text-primary)'}}>
        {controls}
        <div className="p-5 rounded-full mb-4" style={{backgroundColor: 'var(--glass-bg)'}}>
          {isChannel ? <Tv className="w-8 h-8 text-[var(--text-secondary)]" /> : <Speaker className="w-8 h-8 text-[var(--text-secondary)]" />}
        </div>
        <div className="text-center w-full px-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] opacity-60">{t('media.noneMusic')}</p>
          <div className="flex items-center justify-center gap-2 mt-1"><p className="text-xs uppercase tracking-widest text-[var(--text-muted)] opacity-40 truncate">{name}</p></div>
        </div>
      </div>
    );
  }

  return (
    <div key={cardId} {...dragProps} data-haptic={editMode ? undefined : 'card'} onClick={(e) => { e.stopPropagation(); if (!editMode) onOpen(mpId, settingsKey, null); }} className={`touch-feedback p-7 rounded-3xl flex flex-col justify-between transition-all duration-500 border group relative overflow-hidden font-sans h-full ${!editMode ? 'cursor-pointer active:scale-[0.98]' : 'cursor-move'}`} style={{...cardStyle, color: picture ? 'white' : 'var(--text-primary)'}}>
      {controls}
      {cyclePool.length > 1 && (
        <button onClick={cyclePlayers} className="absolute top-4 right-4 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition-colors backdrop-blur-md">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs font-bold">{cyclePool.length}</span>
          <ArrowLeftRight className="w-3 h-3 ml-0.5" />
        </button>
      )}
      {isPlaying && <div className="absolute inset-0 z-0 bg-gradient-to-t from-blue-500/10 via-transparent to-transparent opacity-50 animate-pulse pointer-events-none" />}
      {isPlaying && <div className="absolute inset-0 z-0 bg-gradient-to-t from-blue-500/40 via-transparent to-transparent animate-pulse pointer-events-none" />}
      {picture && (
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <img src={picture} alt="" className={`w-full h-full object-cover blur-xl scale-150 transition-transform duration-[10s] ease-in-out ${isPlaying ? 'scale-[1.6]' : 'scale-150'}`} />
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}
      <div className="relative z-10 flex gap-4 items-start">
        <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-lg">
          {picture ? <img src={picture} alt="Cover" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center">{isChannel ? <Tv className="w-8 h-8 text-[var(--text-secondary)]" /> : <Speaker className="w-8 h-8 text-[var(--text-secondary)]" />}</div>}
        </div>
        <div className="flex flex-col overflow-hidden pt-1">
          <div className="flex items-center gap-2 mb-1"><p className="text-xs font-bold uppercase tracking-widest text-blue-400 truncate">{name}</p></div>
          <h3 className="text-lg font-bold leading-tight truncate mb-0.5">{title || t('common.unknown')}</h3>
          {subtitle && <p className={`${picture ? 'text-gray-400' : 'text-[var(--text-secondary)]'} text-xs truncate font-medium`}>{subtitle}</p>}
        </div>
      </div>
      <div className="relative z-10 flex items-center justify-center gap-8 mt-2">
        <button onClick={(e) => { e.stopPropagation(); callService("media_player", "media_previous_track", { entity_id: mpId }); }} className={`${picture ? 'text-gray-400 hover:text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'} transition-colors p-2 active:scale-90`}><SkipBack className="w-6 h-6" /></button>
        <button onClick={(e) => { e.stopPropagation(); callService("media_player", "media_play_pause", { entity_id: mpId }); }} className="w-12 h-12 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform shadow-lg active:scale-95">{isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}</button>
        <button onClick={(e) => { e.stopPropagation(); callService("media_player", "media_next_track", { entity_id: mpId }); }} className={`${picture ? 'text-gray-400 hover:text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'} transition-colors p-2 active:scale-90`}><SkipForward className="w-6 h-6" /></button>
      </div>
    </div>
  );
};
