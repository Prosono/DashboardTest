import React from 'react';
import { X, Check, Plus, RefreshCw } from 'lucide-react';
import IconPicker from '../components/ui/IconPicker';
import { getEntitiesForArea } from '../services/haClient';

function SearchableSelect({ label, value, options, onChange, placeholder, entities, t }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const dropdownRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getLabel = (id) => entities[id]?.attributes?.friendly_name || id;
  const filtered = options.filter((id) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return id.toLowerCase().includes(q) || getLabel(id).toLowerCase().includes(q);
  });
  const display = value ? getLabel(value) : (placeholder || t('dropdown.noneSelected'));

  return (
    <div ref={dropdownRef}>
      <label className="text-xs uppercase font-bold text-gray-500 ml-4">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full mt-2 px-5 py-3 rounded-2xl popup-surface popup-surface-hover flex items-center justify-between"
      >
        <span className="text-xs font-bold uppercase tracking-widest truncate text-[var(--text-secondary)]">
          {display}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{options.length}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-2xl overflow-hidden border" style={{backgroundColor: 'var(--modal-bg)', borderColor: 'var(--glass-border)'}}>
          <div className="p-3 border-b" style={{borderColor: 'var(--glass-border)'}}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('form.search') || 'Search'}
              className="w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] text-[var(--text-primary)] text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="mt-2 w-full px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {t('dropdown.noneSelected')}
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-xs text-[var(--text-muted)]">{t('form.noResults') || 'No results'}</div>
            )}
            {filtered.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => { onChange(id); setOpen(false); }}
                className={`w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all ${value === id ? 'text-blue-400' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)]'}`}
              >
                {getLabel(id)}
                <span className="block text-[10px] font-normal text-[var(--text-muted)] normal-case tracking-normal truncate">{id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function EditCardModal({ 
  isOpen, 
  onClose, 
  t, 
  entityId,
  entities,
  canEditName, 
  canEditIcon, 
  canEditStatus, 
  isEditSensor,
  isEditCalendar,
  isEditTodo,
  isEditCost,
  isEditCar,
  isEditRoom,
  isEditSauna,
  isEditSaunaBookingTemp,
  isEditDivider,
  isEditAndroidTV,
  editSettingsKey,
  editSettings,
  isEditWeatherTemp,
  conn,
  customNames,
  saveCustomName,
  customIcons,
  saveCustomIcon,
  saveCardSetting,
  gridColumns = 4,
}) {
  const [mediaSearch, setMediaSearch] = React.useState('');
  const [saunaSingleSearch, setSaunaSingleSearch] = React.useState({});
  const [saunaMultiSearch, setSaunaMultiSearch] = React.useState({});

  const translateText = React.useCallback((key, fallback) => {
    const out = typeof t === 'function' ? t(key) : undefined;
    const str = String(out ?? '').trim();
    if (!str || str === key || str.toLowerCase() === key.toLowerCase()) return fallback;
    return str;
  }, [t]);

  if (!isOpen) return null;
  const visibleRoles = Array.isArray(editSettings?.visibleRoles) ? editSettings.visibleRoles : [];
  const roleOptions = [
    { id: 'admin', label: t('role.admin') || 'Admin' },
    { id: 'user', label: t('role.user') || 'User' },
    { id: 'inspector', label: t('role.inspector') || 'Inspector' },
  ];
  const toggleVisibleRole = (roleId) => {
    if (!editSettingsKey) return;
    const next = visibleRoles.includes(roleId)
      ? visibleRoles.filter((id) => id !== roleId)
      : [...visibleRoles, roleId];
    saveCardSetting(editSettingsKey, 'visibleRoles', next.length ? next : null);
  };

  const isPerson = entityId?.startsWith('person.');
  const personDisplay = editSettings?.personDisplay || 'photo';

  const entityEntries = Object.entries(entities || {});
  const byDomain = (domain) => entityEntries.filter(([id]) => id.startsWith(`${domain}.`)).map(([id]) => id);
  const sortByName = (ids) => ids.sort((a, b) => (entities[a]?.attributes?.friendly_name || a).localeCompare(entities[b]?.attributes?.friendly_name || b));
  const batteryOptions = sortByName(entityEntries
    .filter(([id, entity]) => {
      if (!id.startsWith('sensor.') && !id.startsWith('input_number.')) return false;
      const deviceClass = entity?.attributes?.device_class;
      const unit = entity?.attributes?.unit_of_measurement;
      const lowerId = id.toLowerCase();
      return deviceClass === 'battery' || unit === '%' || lowerId.includes('battery') || lowerId.includes('soc');
    })
    .map(([id]) => id));

  const rangeOptions = sortByName(entityEntries
    .filter(([id, entity]) => {
      if (!id.startsWith('sensor.') && !id.startsWith('input_number.')) return false;
      const deviceClass = entity?.attributes?.device_class;
      const unit = entity?.attributes?.unit_of_measurement;
      const lowerId = id.toLowerCase();
      return deviceClass === 'distance' || unit === 'km' || unit === 'mi' || lowerId.includes('range');
    })
    .map(([id]) => id));

  const locationOptions = sortByName(byDomain('device_tracker'));

  const chargingOptions = sortByName(entityEntries
    .filter(([id, entity]) => {
      const lowerId = id.toLowerCase();
      const deviceClass = entity?.attributes?.device_class;
      return lowerId.includes('charging') || deviceClass === 'battery_charging';
    })
    .map(([id]) => id));

  const pluggedOptions = sortByName(entityEntries
    .filter(([id, entity]) => {
      const lowerId = id.toLowerCase();
      const deviceClass = entity?.attributes?.device_class;
      return lowerId.includes('plug') || lowerId.includes('plugged') || deviceClass === 'plug';
    })
    .map(([id]) => id));

  const climateOptions = sortByName(byDomain('climate'));
  const calendarOptions = sortByName(byDomain('calendar'));
  const todoOptions = sortByName(byDomain('todo'));
  const mediaPlayerOptions = sortByName(byDomain('media_player'));
  const saunaTempSensorOptions = sortByName(entityEntries
    .filter(([id, entity]) => {
      if (!id.startsWith('sensor.') && !id.startsWith('number.') && !id.startsWith('input_number.')) return false;
      const deviceClass = String(entity?.attributes?.device_class || '').toLowerCase();
      const lowerId = id.toLowerCase();
      return deviceClass === 'temperature' || lowerId.includes('temp') || lowerId.includes('temperature');
    })
    .map(([id]) => id));
  const saunaActiveOptions = sortByName(entityEntries
    .filter(([id]) => id.startsWith('binary_sensor.') || id.startsWith('input_boolean.') || id.startsWith('sensor.'))
    .map(([id]) => id));
  const saunaServiceOptions = sortByName(entityEntries
    .filter(([id]) => id.startsWith('sensor.') || id.startsWith('select.') || id.startsWith('input_select.') || id.startsWith('binary_sensor.') || id.startsWith('input_boolean.'))
    .map(([id]) => id));

  const parseStateCsv = (value) => String(value || '')
    .split(',')
    .map((state) => state.trim().toLowerCase())
    .filter(Boolean);

  const lastUpdatedOptions = sortByName(entityEntries
    .filter(([id]) => id.startsWith('sensor.') && id.toLowerCase().includes('update'))
    .map(([id]) => id));

  const updateButtonOptions = sortByName(byDomain('button'));

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4" style={{
      backdropFilter: 'blur(20px)', 
      backgroundColor: 'rgba(0,0,0,0.3)'
    }} onClick={onClose}>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      `}</style>
      <div className="border w-full max-w-lg rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 shadow-2xl relative font-sans backdrop-blur-xl popup-anim flex flex-col max-h-[92vh] sm:max-h-[85vh] mt-3 sm:mt-0" style={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)', 
        borderColor: 'var(--glass-border)', 
        color: 'var(--text-primary)'
      }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 md:top-7 md:right-7 modal-close z-10"><X className="w-4 h-4" /></button>
        <h3 className="text-2xl font-light mb-4 text-[var(--text-primary)] text-center uppercase tracking-widest italic shrink-0">{t('modal.editCard.title')}</h3>

        <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-2">
          {(canEditName || editSettingsKey) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {canEditName && (
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('form.name')}</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 text-[var(--text-primary)] rounded-2xl popup-surface focus:border-blue-500/50 outline-none transition-colors" 
                    defaultValue={customNames[entityId] || (entities[entityId]?.attributes?.friendly_name || '')}
                    onBlur={(e) => saveCustomName(entityId, e.target.value)}
                    placeholder={t('form.defaultName')}
                  />
                </div>
              )}


              {editSettingsKey && (
                <div className="space-y-3">
                  <label className="text-xs uppercase font-bold text-gray-500 ml-1">Grid size</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Width (cols)</span>
                      <input
                        type="number"
                        min={1}
                        max={gridColumns}
                        step={1}
                        className="w-full px-3 py-2 text-[var(--text-primary)] rounded-xl popup-surface focus:border-blue-500/50 outline-none transition-colors"
                        value={Number(editSettings.gridColSpan) || 1}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const next = Number.isFinite(value) ? Math.max(1, Math.min(gridColumns, Math.round(value))) : 1;
                          saveCardSetting(editSettingsKey, 'gridColSpan', next);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Height (rows)</span>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        step={1}
                        className="w-full px-3 py-2 text-[var(--text-primary)] rounded-xl popup-surface focus:border-blue-500/50 outline-none transition-colors"
                        value={Number(editSettings.gridRowSpan) || 1}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const next = Number.isFinite(value) ? Math.max(1, Math.min(8, Math.round(value))) : 1;
                          saveCardSetting(editSettingsKey, 'gridRowSpan', next);
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {editSettingsKey && !isEditDivider && (
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('form.heading')}</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 text-[var(--text-primary)] rounded-2xl popup-surface focus:border-blue-500/50 outline-none transition-colors"
                    defaultValue={editSettings.heading || ''}
                    onBlur={(e) => saveCardSetting(editSettingsKey, 'heading', e.target.value.trim() || null)}
                    placeholder={t('form.headingPlaceholder')}
                  />
                </div>
              )}
            </div>
          )}

          {isEditDivider && editSettingsKey && (
            <div className="space-y-3">
              <label className="text-xs uppercase font-bold text-gray-500 ml-1">{translateText('form.dividerOrientation', 'Divider orientation')}</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => saveCardSetting(editSettingsKey, 'orientation', 'horizontal')}
                  className={`px-3 py-2 rounded-xl border text-[11px] uppercase tracking-widest font-bold transition-all ${
                    (editSettings.orientation || 'horizontal') === 'horizontal'
                      ? 'bg-blue-500/15 border-blue-500/35 text-blue-400'
                      : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'
                  }`}
                >
                  {translateText('common.horizontal', 'Horizontal')}
                </button>
                <button
                  type="button"
                  onClick={() => saveCardSetting(editSettingsKey, 'orientation', 'vertical')}
                  className={`px-3 py-2 rounded-xl border text-[11px] uppercase tracking-widest font-bold transition-all ${
                    editSettings.orientation === 'vertical'
                      ? 'bg-blue-500/15 border-blue-500/35 text-blue-400'
                      : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'
                  }`}
                >
                  {translateText('common.vertical', 'Vertical')}
                </button>
              </div>

              <button
                type="button"
                onClick={() => saveCardSetting(editSettingsKey, 'showHeader', !(editSettings.showHeader === true))}
                className={`w-full px-4 py-3 rounded-2xl border text-xs uppercase tracking-widest font-bold transition-all ${
                  (editSettings.showHeader === true)
                    ? 'bg-blue-500/15 border-blue-500/35 text-blue-400'
                    : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)]'
                }`}
              >
                {translateText('form.showHeader', 'Show header')}
              </button>

              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-gray-500 ml-1">{translateText('form.dividerHeader', 'Divider header')}</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 text-[var(--text-primary)] rounded-2xl popup-surface focus:border-blue-500/50 outline-none transition-colors"
                  defaultValue={editSettings.header || ''}
                  onBlur={(e) => saveCardSetting(editSettingsKey, 'header', e.target.value.trim() || '')}
                  placeholder={translateText('form.headingPlaceholder', 'Optional heading')}
                />
                <p className="text-[10px] text-[var(--text-secondary)]">
                  {translateText('form.dividerHeaderHint', 'Header is shown only in horizontal mode.')}
                </p>
              </div>
            </div>
          )}

          {editSettingsKey && (
            <div className="space-y-2">
              <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('form.visibilityRoles') || 'Visible for roles'}</label>
              <div className="rounded-2xl popup-surface p-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {roleOptions.map((role) => {
                    const selected = visibleRoles.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggleVisibleRole(role.id)}
                        className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest font-bold border transition-all ${
                          selected
                            ? 'bg-blue-500/15 border-blue-500/35 text-blue-400'
                            : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {role.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => saveCardSetting(editSettingsKey, 'visibleRoles', null)}
                  className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {t('form.visibilityAllRoles') || 'Allow all roles'}
                </button>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  {t('form.visibilityHint') || 'If nothing is selected, all roles can see this card.'}
                </p>
              </div>
            </div>
          )}



          {canEditIcon && (
            <div className="space-y-2">
              <label className="text-xs uppercase font-bold text-gray-500 ml-4">{t('form.chooseIcon')}</label>
              <IconPicker
                value={customIcons[entityId] || null}
                onSelect={(iconName) => saveCustomIcon(entityId, iconName)}
                onClear={() => saveCustomIcon(entityId, null)}
                t={t}
                maxHeightClass="max-h-48"
              />
            </div>
          )}

          {isEditWeatherTemp && editSettingsKey && (
            <div className="space-y-2">
              <label className="text-xs uppercase font-bold text-gray-500 ml-4 pb-1 block">{t('weatherTemp.effects')}</label>
              <div className="popup-surface rounded-2xl p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--text-primary)]">{t('weatherTemp.showEffects')}</span>
                <button
                  onClick={() => saveCardSetting(editSettingsKey, 'showEffects', editSettings.showEffects === false ? true : false)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${editSettings.showEffects !== false ? 'bg-blue-500' : 'bg-gray-600'}`}
                >
                  <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${editSettings.showEffects !== false ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          )}

          {isEditCalendar && editSettingsKey && (
            <div className="space-y-3">
              <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('calendar.selectCalendars') || 'Select Calendars'}</label>
              <div className="popup-surface rounded-2xl p-4 max-h-56 overflow-y-auto custom-scrollbar space-y-2">
                {calendarOptions.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] text-center py-4">{t('calendar.noCalendarsFound') || 'No calendars found'}</p>
                )}
                {calendarOptions.map((id) => {
                  const selected = Array.isArray(editSettings.calendars) && editSettings.calendars.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        const current = Array.isArray(editSettings.calendars) ? editSettings.calendars : [];
                        const next = selected ? current.filter((x) => x !== id) : [...current, id];
                        saveCardSetting(editSettingsKey, 'calendars', next);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl transition-colors border ${selected ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' : 'border-transparent hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]'}`}
                    >
                      <div className="text-sm font-bold truncate">{entities[id]?.attributes?.friendly_name || id}</div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">{id}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isEditTodo && editSettingsKey && (
            <div className="space-y-3">
              <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('todo.selectList') || 'Select Todo List'}</label>
              <div className="popup-surface rounded-2xl p-4 max-h-56 overflow-y-auto custom-scrollbar space-y-2">
                {todoOptions.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] text-center py-4">{t('todo.noListsFound') || 'No todo lists found'}</p>
                )}
                {todoOptions.map((id) => {
                  const selected = editSettings.todoEntityId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        saveCardSetting(editSettingsKey, 'todoEntityId', selected ? null : id);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl transition-colors border ${selected ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'border-transparent hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]'}`}
                    >
                      <div className="text-sm font-bold truncate">{entities[id]?.attributes?.friendly_name || id}</div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">{id}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isPerson && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-gray-500 ml-4">{t('person.display')}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'personDisplay', 'photo')}
                    className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors ${personDisplay === 'photo' ? 'bg-blue-500 text-white border-blue-500' : 'popup-surface popup-surface-hover text-[var(--text-secondary)]'}`}
                  >
                    {t('person.display.photo')}
                  </button>
                  <button
                    onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'personDisplay', 'icon')}
                    className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors ${personDisplay === 'icon' ? 'bg-blue-500 text-white border-blue-500' : 'popup-surface popup-surface-hover text-[var(--text-secondary)]'}`}
                  >
                    {t('person.display.icon')}
                  </button>
                </div>
              </div>

               {/* Mobile App / Battery Sensor */}
               <div>
                 <label className="text-xs uppercase font-bold text-gray-500 ml-4 pb-2 block">{t('person.mobileAppBattery') || 'Mobile App Battery'}</label>
                 <div className="popup-surface rounded-2xl p-4 max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                    {Object.keys(entities).filter(id => id.startsWith('sensor.') && (id.includes('battery_level') || id.includes('battery'))).length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">{t('addCard.noSensors') || 'No sensors found'}</p>
                    ) : (
                        Object.keys(entities).filter(id => id.startsWith('sensor.') && (id.includes('battery_level') || id.includes('battery')))
                          .sort((a, b) => (entities[a].attributes?.friendly_name || a).localeCompare(entities[b].attributes?.friendly_name || b))
                          .map(sensorId => {
                          const isSelected = editSettings.batteryEntity === sensorId;
                          return (
                              <div key={sensorId} className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors" onClick={() => {
                                  saveCardSetting(editSettingsKey, 'batteryEntity', isSelected ? null : sensorId);
                              }}>
                                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'}`}>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-white" /> } 
                                  </div>
                                  <div className="flex flex-col">
                                      <span className="text-sm font-medium text-[var(--text-primary)]">{entities[sensorId].attributes?.friendly_name || sensorId}</span>
                                      <span className="text-[10px] text-gray-500 font-mono">{sensorId}</span>
                                  </div>
                              </div>
                          );
                        })
                    )}
                 </div>
               </div>

               {/* Device Tracker */}
               <div>
                 <label className="text-xs uppercase font-bold text-gray-500 ml-4 pb-2 block">{t('person.deviceTracker') || 'Device Tracker (Map)'}</label>
                 <div className="popup-surface rounded-2xl p-4 max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                    {Object.keys(entities).filter(id => id.startsWith('device_tracker.')).length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">{t('addCard.noSensors') || 'No trackers found'}</p>
                    ) : (
                        Object.keys(entities).filter(id => id.startsWith('device_tracker.'))
                          .sort((a, b) => (entities[a].attributes?.friendly_name || a).localeCompare(entities[b].attributes?.friendly_name || b))
                          .map(trackerId => {
                          const isSelected = editSettings.deviceTracker === trackerId;
                          return (
                              <div key={trackerId} className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors" onClick={() => {
                                  saveCardSetting(editSettingsKey, 'deviceTracker', isSelected ? null : trackerId);
                              }}>
                                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'}`}>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-white" /> } 
                                  </div>
                                  <div className="flex flex-col">
                                      <span className="text-sm font-medium text-[var(--text-primary)]">{entities[trackerId].attributes?.friendly_name || trackerId}</span>
                                      <span className="text-[10px] text-gray-500 font-mono">{trackerId}</span>
                                  </div>
                              </div>
                          );
                        })
                    )}
                 </div>
               </div>

               {/* Show History Toggle */}
               <div className="flex items-center justify-between p-4 popup-surface rounded-2xl">
                <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('person.showHistory') || 'Show History on Map'}</span>
                  <button 
                    onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'showHistory', !(editSettings.showHistory))}
                    className={`w-12 h-6 rounded-full transition-colors relative ${editSettings.showHistory ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editSettings.showHistory ? 'left-7' : 'left-1'}`} />
                  </button>
              </div>
            </div>
          )}

          {isEditAndroidTV && editSettingsKey && (
            <div className="space-y-3">
              <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('androidtv.linkedSpeakers') || 'Linked Speakers'}</label>
              
              {/* Selected Players */}
              {Array.isArray(editSettings.linkedMediaPlayers) && editSettings.linkedMediaPlayers.length > 0 && (
                 <div className="flex flex-wrap gap-2 mb-2">
                    {editSettings.linkedMediaPlayers.map(id => (
                       <div key={id} className="flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400">
                          <span className="text-xs font-bold">{entities[id]?.attributes?.friendly_name || id}</span>
                          <button 
                             onClick={() => {
                                 const current = editSettings.linkedMediaPlayers;
                                 saveCardSetting(editSettingsKey, 'linkedMediaPlayers', current.filter((x) => x !== id));
                             }}
                             className="p-1 hover:bg-white/10 rounded-full transition-colors"
                          >
                             <X className="w-3 h-3" />
                          </button>
                       </div>
                    ))}
                 </div>
              )}

              <input 
                type="text" 
                placeholder={t('androidtv.searchPlayers')} 
                value={mediaSearch} 
                onChange={(e) => setMediaSearch(e.target.value)} 
                className="w-full px-3 py-2 rounded-xl popup-surface text-sm focus:border-blue-500/50 outline-none mb-2 text-[var(--text-primary)]"
              />

              <div className="popup-surface rounded-2xl p-4 max-h-56 overflow-y-auto custom-scrollbar space-y-2">
                {mediaPlayerOptions.filter(id => {
                  if (!mediaSearch) return true;
                  const name = entities[id]?.attributes?.friendly_name || id;
                  return name.toLowerCase().includes(mediaSearch.toLowerCase()) || id.toLowerCase().includes(mediaSearch.toLowerCase());
                }).length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] text-center py-4">{t('media.noPlayersFound') || 'No players found'}</p>
                )}
                {mediaPlayerOptions
                  .filter(id => {
                    if (!mediaSearch) return true;
                    const name = entities[id]?.attributes?.friendly_name || id;
                    return name.toLowerCase().includes(mediaSearch.toLowerCase()) || id.toLowerCase().includes(mediaSearch.toLowerCase());
                  })
                  .map((id) => {
                  const selected = Array.isArray(editSettings.linkedMediaPlayers) && editSettings.linkedMediaPlayers.includes(id);
                  if (id === editSettings.mediaPlayerId) return null;
                  
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        const current = Array.isArray(editSettings.linkedMediaPlayers) ? editSettings.linkedMediaPlayers : [];
                        const next = selected ? current.filter((x) => x !== id) : [...current, id];
                        saveCardSetting(editSettingsKey, 'linkedMediaPlayers', next);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl transition-colors border ${selected ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' : 'border-transparent hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)]'}`}
                    >
                      <div className="text-sm font-bold truncate">{entities[id]?.attributes?.friendly_name || id}</div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">{id}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isEditCar && editSettingsKey && (() => {
            const [showAddSensor, setShowAddSensor] = React.useState(false);
            const [sensorType, setSensorType] = React.useState('');
            const [sensorEntity, setSensorEntity] = React.useState('');

            const sensorTypes = [
              { key: 'batteryId', label: t('car.select.battery'), options: batteryOptions },
              { key: 'rangeId', label: t('car.select.range'), options: rangeOptions },
              { key: 'locationId', label: t('car.select.location'), options: locationOptions },
              { key: 'chargingId', label: t('car.select.charging'), options: chargingOptions },
              { key: 'pluggedId', label: t('car.select.plugged'), options: pluggedOptions },
              { key: 'climateId', label: t('car.select.climate'), options: climateOptions },
              { key: 'lastUpdatedId', label: t('car.select.lastUpdated'), options: lastUpdatedOptions },
              { key: 'updateButtonId', label: t('car.select.updateButton'), options: updateButtonOptions }
            ];

            const mappedSensors = sensorTypes.filter(st => editSettings[st.key]);

            const availableTypes = sensorTypes.filter(st => !editSettings[st.key]);

            const handleAddSensor = () => {
              if (sensorType && sensorEntity) {
                saveCardSetting(editSettingsKey, sensorType, sensorEntity);
                setSensorType('');
                setSensorEntity('');
                setShowAddSensor(false);
              }
            };

            const handleRemoveSensor = (key) => {
              saveCardSetting(editSettingsKey, key, null);
            };

            return (
              <div className="space-y-3 sm:space-y-4">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  {t('car.mappingTitle')}: {t('car.mappingHint')}
                </div>

                {mappedSensors.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    {t('car.noSensorsMapped')}
                  </div>
                )}

                {mappedSensors.length > 0 && (
                  <div className="space-y-2 sm:space-y-3">
                    {mappedSensors.map(st => {
                      const entityId = editSettings[st.key];
                      const entityName = entities[entityId]?.attributes?.friendly_name || entityId;
                      return (
                        <div key={st.key} className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 popup-surface rounded-xl">
                          <div className="flex-1 min-w-0 mr-4">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-bold text-gray-500 tracking-wide">{st.label}:</span>
                              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{entityName}</span>
                            </div>
                            <span className="text-[10px] text-gray-500 font-mono truncate block mt-0.5">{entityId}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveSensor(st.key)}
                            className="p-2 rounded-lg bg-red-500/10 text-red-400 transition-colors flex-shrink-0"
                            title={t('tooltip.removeCard')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!showAddSensor && availableTypes.length > 0 && (
                  <button
                    onClick={() => setShowAddSensor(true)}
                    className="w-full py-3.5 px-4 rounded-2xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-bold uppercase tracking-widest text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {t('car.addSensor')}
                  </button>
                )}

                {showAddSensor && (
                  <div className="space-y-4 px-4 sm:px-5 py-4 popup-surface rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('car.addSensor')}</span>
                      <button
                        onClick={() => {
                          setShowAddSensor(false);
                          setSensorType('');
                          setSensorEntity('');
                        }}
                        className="p-1.5 rounded-lg hover:bg-[var(--glass-bg-hover)] text-[var(--text-secondary)] transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="text-xs uppercase font-bold text-gray-500 ml-4 mb-2 block">{t('car.sensorType') || 'Sensortype'}</label>
                      <select
                        value={sensorType}
                        onChange={(e) => {
                          setSensorType(e.target.value);
                          setSensorEntity('');
                        }}
                        className="w-full px-4 py-3 rounded-xl popup-surface text-sm outline-none focus:border-blue-500/50 transition-colors"
                        style={{color: 'var(--text-primary)'}}
                      >
                        <option value="" style={{backgroundColor: 'var(--modal-bg)', color: 'var(--text-primary)'}}>{t('car.selectSensorType') || 'Vel sensortype...'}</option>
                        {availableTypes.map(st => (
                          <option key={st.key} value={st.key} style={{backgroundColor: 'var(--modal-bg)', color: 'var(--text-primary)'}}>{st.label}</option>
                        ))}
                      </select>
                    </div>

                    {sensorType && (() => {
                      const selectedType = sensorTypes.find(st => st.key === sensorType);
                      if (!selectedType) return null;

                      return (
                        <SearchableSelect
                          label={t('car.selectEntity')}
                          value={sensorEntity}
                          options={selectedType.options}
                          onChange={(value) => setSensorEntity(value)}
                          placeholder={t('car.selectEntityPlaceholder')}
                          entities={entities}
                          t={t}
                        />
                      );
                    })()}

                    <div className="flex gap-2">
                      <button
                        onClick={handleAddSensor}
                        disabled={!sensorType || !sensorEntity}
                        className="flex-1 py-3 px-4 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold uppercase tracking-widest text-xs transition-colors"
                      >
                        {t('car.add')}
                      </button>
                      <button
                        onClick={() => {
                          setShowAddSensor(false);
                          setSensorType('');
                          setSensorEntity('');
                        }}
                        className="px-4 py-3 rounded-xl popup-surface popup-surface-hover text-[var(--text-secondary)] font-bold uppercase tracking-widest text-xs transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {availableTypes.length === 0 && !showAddSensor && (
                  <div className="text-center py-4 text-gray-500 text-xs">
                    {t('car.allSensorsMapped')}
                  </div>
                )}
              </div>
            );
          })()}

          {canEditStatus && !isEditSensor && (
            <div className="p-4 popup-surface rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('form.showStatus')}</span>
                <button 
                  onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'showStatus', !(editSettings.showStatus !== false))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${editSettings.showStatus !== false ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editSettings.showStatus !== false ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('form.showLastChanged')}</span>
                <button 
                  onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'showLastChanged', !(editSettings.showLastChanged !== false))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${editSettings.showLastChanged !== false ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editSettings.showLastChanged !== false ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>
          )}

          {isEditSensor && (() => {
             const entity = entities[entityId];
             const domain = entityId.split('.')[0];
             const canControl = ['input_boolean', 'switch', 'light', 'input_number', 'automation', 'script', 'scene'].includes(domain);
             
             const state = entity?.state;
             const isNumeric = typeof state === 'string' ? /^\s*-?\d+(\.\d+)?\s*$/.test(state) : !isNaN(parseFloat(state));
             const canGraph = isNumeric && domain !== 'input_number';

             return (
              <div className="p-4 popup-surface rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('form.showName') || 'Show Name'}</span>
                      <button 
                        onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'showName', !(editSettings.showName !== false))}
                        className={`w-12 h-6 rounded-full transition-colors relative ${editSettings.showName !== false ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editSettings.showName !== false ? 'left-7' : 'left-1'}`} />
                      </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('form.showStatus') || 'Show Status'}</span>
                      <button 
                        onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'showStatus', !(editSettings.showStatus !== false))}
                        className={`w-12 h-6 rounded-full transition-colors relative ${editSettings.showStatus !== false ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editSettings.showStatus !== false ? 'left-7' : 'left-1'}`} />
                      </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('form.showLastChanged') || 'Show Last Changed'}</span>
                    <button 
                      onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'showLastChanged', !(editSettings.showLastChanged !== false))}
                      className={`w-12 h-6 rounded-full transition-colors relative ${editSettings.showLastChanged !== false ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editSettings.showLastChanged !== false ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  {canControl && (
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                        <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('form.showControls')}</span>
                        <span className="text-[10px] text-gray-500">{t('form.controlsHint')}</span>
                        </div>
                        <button 
                        onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'showControls', !editSettings.showControls)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${editSettings.showControls ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                        >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editSettings.showControls ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>
                  )}

                  {canGraph && (
                    <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('form.showGraph')}</span>
                        <span className="text-[10px] text-gray-500">{t('form.graphHint')}</span>
                    </div>
                    <button 
                        onClick={() => editSettingsKey && saveCardSetting(editSettingsKey, 'showGraph', !(editSettings.showGraph !== false))}
                        className={`w-12 h-6 rounded-full transition-colors relative ${editSettings.showGraph !== false ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editSettings.showGraph !== false ? 'left-7' : 'left-1'}`} />
                    </button>
                    </div>
                  )}
              </div>
             );
          })()}

          {isEditRoom && editSettingsKey && (() => {
            const [refreshing, setRefreshing] = React.useState(false);

            const roomEntityIds = Array.isArray(editSettings.entityIds) ? editSettings.entityIds : [];

            const handleRefresh = async () => {
              if (!conn || !editSettings.areaId) return;
              setRefreshing(true);
              try {
                const newEntities = await getEntitiesForArea(conn, editSettings.areaId);
                saveCardSetting(editSettingsKey, 'entityIds', newEntities);
              } catch (err) {
                console.error('Failed to refresh room entities:', err);
              }
              setRefreshing(false);
            };

            const toggleOptions = [
              { key: 'showLights', label: t('room.showLights'), defaultVal: true },
              { key: 'showTemp', label: t('room.showTemp'), defaultVal: true },
              { key: 'showMotion', label: t('room.showMotion'), defaultVal: true },
              { key: 'showHumidity', label: t('room.showHumidity'), defaultVal: false },
              { key: 'showClimate', label: t('room.showClimate'), defaultVal: false },
            ];

            const sensorOptions = [
              { key: 'tempEntityId', label: t('room.tempSensor'), filter: (id) => {
                const e = entities[id];
                return e && (e.attributes?.device_class === 'temperature' || id.includes('temperature') || id.includes('temp'));
              }},
              { key: 'motionEntityId', label: t('room.motionSensor'), filter: (id) => {
                const e = entities[id];
                return e && (e.attributes?.device_class === 'motion' || e.attributes?.device_class === 'occupancy');
              }},
              { key: 'humidityEntityId', label: t('room.humiditySensor'), filter: (id) => {
                const e = entities[id];
                return e && e.attributes?.device_class === 'humidity';
              }},
              { key: 'climateEntityId', label: t('room.climateSensor'), filter: (id) => id.startsWith('climate.') },
              { key: 'mainLightEntityId', label: t('room.mainLight'), filter: (id) => id.startsWith('light.') },
            ];

            return (
              <div className="space-y-5">
                {/* Refresh entities from HA */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    {roomEntityIds.length} {t('room.entityCount')}
                  </span>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing || !conn}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    {t('room.refreshEntities')}
                  </button>
                </div>

                {/* Badge toggles */}
                <div className="popup-surface rounded-2xl p-4 space-y-4">
                  {toggleOptions.map(opt => {
                    const value = editSettings[opt.key] !== undefined ? editSettings[opt.key] : opt.defaultVal;
                    return (
                      <div key={opt.key} className="flex items-center justify-between">
                        <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{opt.label}</span>
                        <button
                          onClick={() => saveCardSetting(editSettingsKey, opt.key, !value)}
                          className={`w-12 h-6 rounded-full transition-colors relative ${value ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${value ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Specific sensor overrides */}
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">
                    {t('room.tempSensor')} / {t('room.motionSensor')}
                  </span>
                  {sensorOptions.map(opt => {
                    const matching = roomEntityIds.filter(opt.filter);
                    if (matching.length === 0) return null;
                    return (
                      <div key={opt.key}>
                        <label className="text-[10px] uppercase font-bold text-gray-500 ml-4 block mb-1">{opt.label}</label>
                        <div className="popup-surface rounded-2xl p-3 max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                          <button
                            type="button"
                            onClick={() => saveCardSetting(editSettingsKey, opt.key, null)}
                            className={`w-full text-left px-3 py-2 rounded-xl transition-colors text-xs font-bold uppercase tracking-widest ${!editSettings[opt.key] ? 'text-blue-400' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'}`}
                          >
                            Auto
                          </button>
                          {matching.map(id => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => saveCardSetting(editSettingsKey, opt.key, id)}
                              className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${editSettings[opt.key] === id ? 'text-blue-400' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'}`}
                            >
                              <div className="text-xs font-bold truncate">{entities[id]?.attributes?.friendly_name || id}</div>
                              <div className="text-[10px] text-[var(--text-muted)] truncate">{id}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}


          {isEditSauna && editSettingsKey && (() => {
            const allEntityIds = Object.keys(entities || {});
            const saunaToggleOptions = [
              { key: 'showFlame', label: translateText('sauna.showFlame', 'Show flame') },
              { key: 'showManualMode', label: translateText('sauna.showManualMode', 'Show manual/auto mode') },
              { key: 'showBookingChartOverlay', label: translateText('sauna.showBookingChartOverlay', 'Show bookings in temperature chart') },
              { key: 'showThermostat', label: translateText('sauna.showThermostat', 'Show thermostat') },
              { key: 'showMotion', label: translateText('sauna.showMotion', 'Show motion') },
              { key: 'showLights', label: translateText('sauna.showLights', 'Show lights') },
              { key: 'showLocks', label: translateText('sauna.showLocks', 'Show locks') },
              { key: 'showDoors', label: translateText('sauna.showDoors', 'Show doors') },
              { key: 'showFans', label: translateText('sauna.showFans', 'Show fans') },
              { key: 'showThermostatOverview', label: translateText('sauna.showThermostatOverview', 'Show thermostat overview') },
              { key: 'showActiveCodes', label: translateText('sauna.showActiveCodes', 'Show active codes') },
              { key: 'showTempOverview', label: translateText('sauna.showTempOverview', 'Show temperature overview') },
              { key: 'showAutoLock', label: translateText('sauna.showAutoLock', 'Show auto lock') },
            ];

            const singleSelectors = [
              {
                key: 'tempEntityId',
                label: translateText('sauna.tempSensor', 'Temperatur - sensor'),
                filter: (id) => {
                  const e = entities[id];
                  return e && (e.attributes?.device_class === 'temperature' || id.includes('temp'));
                },
              },
              {
                key: 'peopleNowEntityId',
                label: translateText('sauna.peopleNowEntity', 'Antall folk nå - sensor'),
                filter: (id) => id.startsWith('input_number.') || id.startsWith('number.') || id.startsWith('sensor.'),
              },
              {
                key: 'preheatMinutesEntityId',
                label: translateText('sauna.preheatMinutesEntity', 'Forvarmingstid - minutter (sensor)'),
                filter: (id) => id.startsWith('input_number.') || id.startsWith('number.') || id.startsWith('sensor.'),
              },
              {
                key: 'saunaActiveBooleanEntityId',
                label: translateText('sauna.activeNowEntity', 'Aktiv nå - binærsensor'),
                filter: (id) => id.startsWith('binary_sensor.') || id.startsWith('input_boolean.'),
              },
              {
                key: 'serviceEntityId',
                label: translateText('sauna.serviceEntity', 'Service status - sensor (Ja/Nei)'),
                filter: (id) => id.startsWith('sensor.') || id.startsWith('input_select.') || id.startsWith('select.'),
              },
              {
                key: 'nextBookingInMinutesEntityId',
                label: translateText('sauna.nextBookingEntity', 'Neste booking i minutter - sensor'),
                filter: (id) => id.startsWith('sensor.') || id.startsWith('input_number.') || id.startsWith('number.'),
              },
              {
                key: 'nextBookingServiceEntityId',
                label: translateText('sauna.nextBookingServiceEntity', 'Neste booking er service - sensor (Ja/Nei)'),
                filter: (id) => id.startsWith('sensor.'),
              },
              {
                key: 'preheatWindowEntityId',
                label: translateText('sauna.preheatWindowEntity', 'Forvarmingsvindu - binærsensor'),
                filter: (id) => id.startsWith('binary_sensor.') || id.startsWith('input_boolean.'),
              },
              {
                key: 'statusGraphEntityId',
                label: translateText('sauna.statusGraphEntity', 'Statusgraf (12t) - temperatursensor'),
                filter: (id) => {
                  const e = entities[id];
                  const dc = String(e?.attributes?.device_class || '');
                  return (id.startsWith('sensor.') || id.startsWith('number.') || id.startsWith('input_number.')) && (dc === 'temperature' || id.includes('temp'));
                },
              },
              {
                key: 'manualModeEntityId',
                label: translateText('sauna.manualModeEntity', 'Manuell modus - bryter'),
                filter: (id) => id.startsWith('input_boolean.') || id.startsWith('switch.'),
              },
              {
                key: 'thermostatEntityId',
                label: translateText('sauna.thermostatEntity', 'Termostat - entitet'),
                filter: (id) => id.startsWith('climate.') || id.startsWith('switch.') || id.startsWith('input_boolean.'),
              },
              {
                key: 'motionEntityId',
                label: translateText('sauna.motionEntity', 'Bevegelse - sensor'),
                filter: (id) => {
                  const e = entities[id];
                  return e && id.startsWith('binary_sensor.') && ['motion', 'occupancy', 'presence'].includes(String(e.attributes?.device_class || ''));
                },
              },
              {
                key: 'flameEntityId',
                label: translateText('sauna.flameEntity', 'Varme/Flamme - bryter'),
                filter: (id) => id.startsWith('switch.') || id.startsWith('input_boolean.') || id.startsWith('binary_sensor.'),
              },
              {
                key: 'autoLockEntityId',
                label: translateText('sauna.autoLockEntity', 'Autolås - bryter'),
                filter: (id) => id.startsWith('input_boolean.') || id.startsWith('switch.'),
              },
            ];

            const multiSelectors = [
              { key: 'lightEntityIds', label: translateText('sauna.lightEntities', 'Lys - entiteter'), filter: (id) => id.startsWith('light.') },
              { key: 'lockEntityIds', label: translateText('sauna.lockEntities', 'Låser - entiteter'), filter: (id) => id.startsWith('lock.') },
              { key: 'doorEntityIds', label: translateText('sauna.doorEntities', 'Dører - sensorer'), filter: (id) => {
                const e = entities[id];
                const dc = String(e?.attributes?.device_class || '');
                return id.startsWith('binary_sensor.') && ['door', 'window', 'opening'].includes(dc);
              }},
              { key: 'fanEntityIds', label: translateText('sauna.fanEntities', 'Vifter - entiteter'), filter: (id) => id.startsWith('fan.') || id.startsWith('switch.') },
              { key: 'thermostatEntityIds', label: translateText('sauna.thermostatEntities', 'Termostater - entiteter'), filter: (id) => id.startsWith('climate.') || id.startsWith('switch.') || id.startsWith('input_boolean.') },
              { key: 'codeEntityIds', label: translateText('sauna.codeEntities', 'Aktive koder - entiteter'), filter: (id) => id.startsWith('input_number.') || id.startsWith('number.') || id.startsWith('sensor.') },
              { key: 'tempOverviewEntityIds', label: translateText('sauna.tempOverviewEntities', 'Temperaturoversikt - sensorer'), filter: (id) => {
                const e = entities[id];
                const dc = String(e?.attributes?.device_class || '');
                return (id.startsWith('sensor.') || id.startsWith('number.')) && (dc === 'temperature' || id.includes('temp'));
              }},
            ];

            return (
              <div className="space-y-6">
                <div className="popup-surface rounded-2xl p-4 space-y-3">
                  <div className="text-xs uppercase font-bold tracking-widest text-gray-500">{translateText('sauna.cardOptions', 'Innstillinger for badstukort')}</div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-bold text-gray-500 ml-1">{translateText('sauna.imageUrl', 'Bilde-URL')}</label>
                    <input
                      type="text"
                      value={editSettings.imageUrl || ''}
                      onChange={(e) => saveCardSetting(editSettingsKey, 'imageUrl', e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-3 text-xs text-blue-100">
                    <div className="font-bold uppercase tracking-widest text-[10px] mb-1">Statuslinje på badstukort</div>
                    <div>For å vise status-tekst/ikon trenger du disse sensorene:</div>
                    <ul className="list-disc ml-4 mt-1 space-y-0.5">
                      <li>Aktiv nå - binærsensor</li>
                      <li>Service status - sensor (Ja/Nei)</li>
                      <li>Neste booking i minutter - sensor</li>
                      <li>Forvarmingsvindu - binærsensor</li>
                    </ul>
                  </div>
                  {saunaToggleOptions.map((opt) => {
                    const enabled = editSettings[opt.key] !== false;
                    return (
                      <div key={opt.key} className="flex items-center justify-between">
                        <span className="text-sm text-[var(--text-primary)]">{opt.label}</span>
                        <button
                          onClick={() => saveCardSetting(editSettingsKey, opt.key, !enabled)}
                          className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {singleSelectors.map((opt) => {
                  const matching = allEntityIds.filter(opt.filter).sort((a, b) => (entities[a]?.attributes?.friendly_name || a).localeCompare(entities[b]?.attributes?.friendly_name || b));
                  const query = String(saunaSingleSearch?.[opt.key] || '').toLowerCase().trim();
                  const filtered = query
                    ? matching.filter((id) => {
                      const friendly = String(entities[id]?.attributes?.friendly_name || '').toLowerCase();
                      return id.toLowerCase().includes(query) || friendly.includes(query);
                    })
                    : matching;
                  return (
                    <div key={opt.key} className="space-y-2">
                      <label className="text-xs uppercase font-bold text-gray-500 ml-1">{opt.label}</label>
                      <input
                        type="text"
                        value={saunaSingleSearch?.[opt.key] || ''}
                        onChange={(e) => setSaunaSingleSearch((prev) => ({ ...prev, [opt.key]: e.target.value }))}
                        placeholder={translateText('form.search', 'Søk')} 
                        className="w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] text-xs outline-none"
                      />
                      <div className="popup-surface rounded-2xl p-3 max-h-36 overflow-y-auto custom-scrollbar space-y-1">
                        <button
                          type="button"
                          onClick={() => saveCardSetting(editSettingsKey, opt.key, null)}
                          className={`w-full text-left px-3 py-2 rounded-xl transition-colors text-xs font-bold uppercase tracking-widest ${!editSettings[opt.key] ? 'text-blue-400' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'}`}
                        >
                          Auto / none
                        </button>
                        {filtered.length === 0 && (
                          <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]">{translateText('form.noResults', 'Ingen treff')}</div>
                        )}
                        {filtered.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => saveCardSetting(editSettingsKey, opt.key, id)}
                            className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${editSettings[opt.key] === id ? 'text-blue-400' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'}`}
                          >
                            <div className="text-xs font-bold truncate">{entities[id]?.attributes?.friendly_name || id}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{id}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {multiSelectors.map((opt) => {
                  const selected = Array.isArray(editSettings[opt.key]) ? editSettings[opt.key] : [];
                  const matching = allEntityIds.filter(opt.filter).sort((a, b) => (entities[a]?.attributes?.friendly_name || a).localeCompare(entities[b]?.attributes?.friendly_name || b));
                  const query = String(saunaMultiSearch?.[opt.key] || '').toLowerCase().trim();
                  const filtered = query
                    ? matching.filter((id) => {
                      const friendly = String(entities[id]?.attributes?.friendly_name || '').toLowerCase();
                      return id.toLowerCase().includes(query) || friendly.includes(query);
                    })
                    : matching;
                  return (
                    <div key={opt.key} className="space-y-2">
                      <label className="text-xs uppercase font-bold text-gray-500 ml-1">{opt.label}</label>
                      <input
                        type="text"
                        value={saunaMultiSearch?.[opt.key] || ''}
                        onChange={(e) => setSaunaMultiSearch((prev) => ({ ...prev, [opt.key]: e.target.value }))}
                        placeholder={translateText('form.search', 'Søk')}
                        className="w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] text-xs outline-none"
                      />
                      <div className="popup-surface rounded-2xl p-3 max-h-44 overflow-y-auto custom-scrollbar space-y-1">
                        {filtered.length === 0 && (
                          <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]">{translateText('form.noResults', 'Ingen treff')}</div>
                        )}
                        {filtered.map((id) => {
                          const isSelected = selected.includes(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                const next = isSelected ? selected.filter((x) => x !== id) : [...selected, id];
                                saveCardSetting(editSettingsKey, opt.key, next);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-xl transition-colors ${isSelected ? 'text-blue-400' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]'}`}
                            >
                              <div className="text-xs font-bold truncate">{entities[id]?.attributes?.friendly_name || id}</div>
                              <div className="text-[10px] text-[var(--text-muted)] truncate">{id}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-gray-500 ml-1">{translateText('sauna.statIcons', 'Statusikoner')}</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'thermostatIcon', label: t('sauna.thermostat') || 'Thermostat' },
                      { key: 'motionIcon', label: t('sauna.motion') || 'Motion' },
                      { key: 'lightsIcon', label: t('sauna.lights') || 'Lights' },
                      { key: 'locksIcon', label: t('sauna.unlocked') || 'Locks' },
                      { key: 'doorsIcon', label: t('sauna.doorsOpen') || 'Doors' },
                      { key: 'fansIcon', label: t('sauna.fans') || 'Fans' },
                      { key: 'thermostatsIcon', label: t('sauna.thermostats') || 'Thermostats' },
                      { key: 'codesIcon', label: t('sauna.activeCodes') || 'Codes' },
                      { key: 'autoLockIcon', label: t('sauna.autoLock') || 'Auto lock' },
                    ].map((opt) => (
                      <div key={opt.key} className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{opt.label}</span>
                        <IconPicker
                          value={editSettings[opt.key] || null}
                          onSelect={(iconName) => saveCardSetting(editSettingsKey, opt.key, iconName)}
                          onClear={() => saveCardSetting(editSettingsKey, opt.key, null)}
                          t={t}
                          maxHeightClass="max-h-36"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {isEditSaunaBookingTemp && editSettingsKey && (
            <div className="space-y-6">
              <div className="popup-surface rounded-2xl p-4 space-y-3">
                <div className="text-xs uppercase font-bold tracking-widest text-gray-500">
                  {translateText('sauna.bookingTemp.cardOptions', 'Sauna hourly KPI logger')}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {translateText('sauna.bookingTemp.description', 'Stores sauna KPIs each hour at :01 when sauna is active and service is off.')}
                </div>
              </div>

              <SearchableSelect
                label={translateText('sauna.bookingTemp.tempEntity', 'Current temperature sensor')}
                value={editSettings.tempEntityId || null}
                options={saunaTempSensorOptions}
                onChange={(value) => saveCardSetting(editSettingsKey, 'tempEntityId', value)}
                placeholder={translateText('dropdown.noneSelected', 'None selected')}
                entities={entities}
                t={t}
              />

              <SearchableSelect
                label={translateText('sauna.bookingTemp.activeEntity', 'Booking active sensor')}
                value={editSettings.bookingActiveEntityId || null}
                options={saunaActiveOptions}
                onChange={(value) => saveCardSetting(editSettingsKey, 'bookingActiveEntityId', value)}
                placeholder={translateText('dropdown.noneSelected', 'None selected')}
                entities={entities}
                t={t}
              />

              <SearchableSelect
                label={translateText('sauna.bookingTemp.serviceEntity', 'Service type sensor (optional)')}
                value={editSettings.serviceEntityId || null}
                options={saunaServiceOptions}
                onChange={(value) => saveCardSetting(editSettingsKey, 'serviceEntityId', value)}
                placeholder={translateText('dropdown.noneSelected', 'None selected')}
                entities={entities}
                t={t}
              />

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  {translateText('sauna.bookingTemp.targetEntity', 'Target temperature (deg C, optional)')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={130}
                  step={0.5}
                  className="w-full px-3 py-2 rounded-xl popup-surface text-[var(--text-primary)]"
                  value={editSettings.targetTempValue ?? ''}
                  placeholder="80"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      saveCardSetting(editSettingsKey, 'targetTempValue', null);
                      return;
                    }
                    const value = Number(raw);
                    if (!Number.isFinite(value)) return;
                    saveCardSetting(editSettingsKey, 'targetTempValue', Math.max(0, Math.min(130, Number(value.toFixed(1)))));
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    {translateText('sauna.bookingTemp.summaryHours', 'Summary hours')}
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={168}
                    step={1}
                    className="w-full px-3 py-2 rounded-xl popup-surface text-[var(--text-primary)]"
                    value={Number(editSettings.summaryHours) || 24}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      saveCardSetting(editSettingsKey, 'summaryHours', Math.max(6, Math.min(168, Math.round(value))));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    {translateText('sauna.bookingTemp.recentRows', 'Rows shown')}
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    step={1}
                    className="w-full px-3 py-2 rounded-xl popup-surface text-[var(--text-primary)]"
                    value={Number(editSettings.recentRows) || 6}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      saveCardSetting(editSettingsKey, 'recentRows', Math.max(3, Math.min(20, Math.round(value))));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    {translateText('sauna.bookingTemp.keepDays', 'Retention days')}
                  </label>
                  <input
                    type="number"
                    min={7}
                    max={365}
                    step={1}
                    className="w-full px-3 py-2 rounded-xl popup-surface text-[var(--text-primary)]"
                    value={Number(editSettings.keepDays) || 120}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      saveCardSetting(editSettingsKey, 'keepDays', Math.max(7, Math.min(365, Math.round(value))));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                    {translateText('sauna.bookingTemp.maxEntries', 'Max entries')}
                  </label>
                  <input
                    type="number"
                    min={25}
                    max={3000}
                    step={25}
                    className="w-full px-3 py-2 rounded-xl popup-surface text-[var(--text-primary)]"
                    value={Number(editSettings.maxEntries) || 500}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isFinite(value)) return;
                      saveCardSetting(editSettingsKey, 'maxEntries', Math.max(25, Math.min(3000, Math.round(value))));
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  {translateText('sauna.bookingTemp.targetTolerance', 'Target tolerance (deg C)')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.1}
                  className="w-full px-3 py-2 rounded-xl popup-surface text-[var(--text-primary)]"
                  value={Number.isFinite(Number(editSettings.targetToleranceC)) ? Number(editSettings.targetToleranceC) : 0}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isFinite(value)) return;
                    saveCardSetting(editSettingsKey, 'targetToleranceC', Math.max(0, Math.min(20, Number(value.toFixed(1)))));
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  {translateText('sauna.bookingTemp.activeStates', 'Booking active states (comma separated)')}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl popup-surface text-[var(--text-primary)]"
                  defaultValue={Array.isArray(editSettings.activeOnStates) && editSettings.activeOnStates.length ? editSettings.activeOnStates.join(', ') : 'on, true, 1, yes, active'}
                  onBlur={(e) => {
                    const parsed = parseStateCsv(e.target.value);
                    saveCardSetting(editSettingsKey, 'activeOnStates', parsed.length ? parsed : null);
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  {translateText('sauna.bookingTemp.serviceStates', 'Service states (comma separated)')}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 rounded-xl popup-surface text-[var(--text-primary)]"
                  defaultValue={Array.isArray(editSettings.serviceOnStates) && editSettings.serviceOnStates.length ? editSettings.serviceOnStates.join(', ') : 'ja, yes, service, on, true'}
                  onBlur={(e) => {
                    const parsed = parseStateCsv(e.target.value);
                    saveCardSetting(editSettingsKey, 'serviceOnStates', parsed.length ? parsed : null);
                  }}
                />
              </div>

              <div className="popup-surface rounded-2xl p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  {translateText('sauna.bookingTemp.history', 'Stored booking starts')}
                </div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {Array.isArray(editSettings.bookingSnapshots) ? editSettings.bookingSnapshots.length : 0}
                </div>
                <button
                  type="button"
                  onClick={() => saveCardSetting(editSettingsKey, 'bookingSnapshots', [])}
                  className="w-full px-3 py-2 rounded-xl border border-red-400/35 bg-red-500/10 text-red-300 text-xs font-bold uppercase tracking-widest hover:bg-red-500/15 transition-colors"
                >
                  {translateText('sauna.bookingTemp.clearHistory', 'Clear stored history')}
                </button>
              </div>
            </div>
          )}

          {isEditCost && (
            <div className="space-y-6">
              <div>
                <label className="text-xs uppercase font-bold text-gray-500 ml-4 pb-2 block">{t('energyCost.today') || 'Today'}</label>
                <div className="popup-surface rounded-2xl p-4 max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                  {Object.keys(entities).filter(id => id.startsWith('sensor.') || id.startsWith('input_number.')).length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">{t('addCard.noSensors') || 'No sensors found'}</p>
                  ) : (
                    Object.keys(entities).filter(id => id.startsWith('sensor.') || id.startsWith('input_number.'))
                      .sort((a, b) => (entities[a].attributes?.friendly_name || a).localeCompare(entities[b].attributes?.friendly_name || b))
                      .map(sensorId => {
                        const isSelected = editSettings.todayId === sensorId;
                        return (
                          <div key={sensorId} className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors" onClick={() => {
                            saveCardSetting(editSettingsKey, 'todayId', isSelected ? null : sensorId);
                          }}>
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'}`}>
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" /> }
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-[var(--text-primary)]">{entities[sensorId].attributes?.friendly_name || sensorId}</span>
                              <span className="text-[10px] text-gray-500 font-mono">{sensorId}</span>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-gray-500 ml-4 pb-2 block">{t('energyCost.thisMonth') || 'This Month'}</label>
                <div className="popup-surface rounded-2xl p-4 max-h-40 overflow-y-auto custom-scrollbar space-y-2">
                  {Object.keys(entities).filter(id => id.startsWith('sensor.') || id.startsWith('input_number.')).length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">{t('addCard.noSensors') || 'No sensors found'}</p>
                  ) : (
                    Object.keys(entities).filter(id => id.startsWith('sensor.') || id.startsWith('input_number.'))
                      .sort((a, b) => (entities[a].attributes?.friendly_name || a).localeCompare(entities[b].attributes?.friendly_name || b))
                      .map(sensorId => {
                        const isSelected = editSettings.monthId === sensorId;
                        return (
                          <div key={sensorId} className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors" onClick={() => {
                            saveCardSetting(editSettingsKey, 'monthId', isSelected ? null : sensorId);
                          }}>
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-500 bg-transparent'}`}>
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" /> }
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-[var(--text-primary)]">{entities[sensorId].attributes?.friendly_name || sensorId}</span>
                              <span className="text-[10px] text-gray-500 font-mono">{sensorId}</span>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-gray-500 ml-4">{t('cost.decimals') || 'Decimals (Today)'}</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={1}
                    value={editSettings.decimals ?? 0}
                    onChange={(e) => saveCardSetting(editSettingsKey, 'decimals', parseInt(e.target.value, 10))}
                    className="flex-1"
                  />
                  <div className="min-w-[48px] text-center text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] popup-surface px-3 py-2 rounded-xl">
                    {editSettings.decimals ?? 0}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pt-5 mt-5 border-t border-[var(--glass-border)] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl popup-surface popup-surface-hover text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
