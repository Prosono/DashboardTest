import React, { useEffect, useState } from 'react';
import { Palette, ChevronDown, Maximize2, Eye, RefreshCw, Type, AlignLeft, LayoutGrid } from '../../icons';
import M3Slider from '../ui/M3Slider';
import SidebarContainer from './SidebarContainer';
import { resolveLogoUrl } from '../../utils/branding';

const FONTS = [
  { value: 'sans', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Raleway', label: 'Raleway' },
  { value: 'georgia', label: 'Georgia' },
  { value: 'courier', label: 'Courier' },
];

const FONT_WEIGHTS = [
  { value: '100', key: '100' },
  { value: '300', key: '300' },
  { value: '400', key: '400' },
  { value: '500', key: '500' },
  { value: '700', key: '700' },
];

const LETTER_SPACINGS = [
  { value: 'tight', em: '0.05em' },
  { value: 'normal', em: '0.2em' },
  { value: 'wide', em: '0.5em' },
  { value: 'extraWide', em: '0.8em' },
];

// Helper components defined OUTSIDE to prevent focus loss
const SegmentedControl = ({ options, value, onChange }) => (
  <div className="flex gap-1 p-0.5 rounded-xl border" style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}>
    {options.map(opt => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`flex-1 py-1.5 px-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all text-center ${
          value === opt.value
            ? 'text-white shadow-lg'
            : 'hover:text-white'
        }`}
        style={value === opt.value 
          ? { backgroundColor: 'var(--accent-color)' }
          : { color: 'var(--text-secondary)', backgroundColor: 'transparent' }
        }
      >
        {opt.label || opt.key}
      </button>
    ))}
  </div>
);

const Toggle = ({ label, value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className="w-full flex items-center justify-between py-2 group"
  >
    <span className="text-[12px] font-medium transition-colors group-hover:text-white" style={{ color: 'var(--text-secondary)' }}>{label}</span>
    <div className="w-9 h-5 rounded-full relative transition-all duration-300" style={{ backgroundColor: value ? 'var(--accent-color)' : 'var(--glass-bg)' }}>
      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${value ? 'left-[calc(100%-16px)]' : 'left-1'}`} />
    </div>
  </button>
);

const ResetButton = ({ onClick, t }) => (
  <button 
    onClick={onClick} 
    className="p-1.5 rounded-full hover:text-white transition-all"
    style={{ color: 'var(--text-muted)' }}
    title={t ? t('settings.reset') : 'Reset'}
  >
    <RefreshCw className="w-3.5 h-3.5" />
  </button>
);

const Section = ({ id, icon: Icon, title, children, isOpen, toggle }) => (
  <div className="rounded-2xl transition-all border" style={{ 
      backgroundColor: isOpen ? 'var(--glass-bg)' : 'transparent',
      borderColor: isOpen ? 'var(--glass-border)' : 'transparent'
  }}>
    <button
      type="button"
      onClick={() => toggle(id)}
      className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors group"
    >
      <div className="p-2 rounded-xl transition-colors" style={isOpen ? { backgroundColor: 'var(--accent-bg)', color: 'var(--accent-color)' } : { color: 'var(--text-secondary)' }}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <span className="flex-1 text-[13px] font-semibold transition-colors" style={{ color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{title}</span>
      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-secondary)' }} />
    </button>
    <div
      className="grid transition-all duration-300 ease-in-out"
      style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden">
         <div className="px-4 pb-4 space-y-5">
          {children}
        </div>
      </div>
    </div>
  </div>
);

export default function HeaderSidebar({
  open,
  onClose,
  headerTitle,
  headerScale,
  headerSettings,
  updateHeaderTitle,
  updateHeaderScale,
  updateHeaderSettings,
  onSaveLogos,
  onSwitchToTheme,
  onSwitchToLayout,
  t
}) {
  const [sections, setSections] = useState({ typography: true, style: false, clock: false, visibility: false });
  const [logoDraftDefault, setLogoDraftDefault] = useState(String(headerSettings?.logoUrl || ''));
  const [logoDraftLight, setLogoDraftLight] = useState(String(headerSettings?.logoUrlLight || ''));
  const [logoDraftDark, setLogoDraftDark] = useState(String(headerSettings?.logoUrlDark || ''));
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [logoSavedAt, setLogoSavedAt] = useState(0);
  const [logoSaveState, setLogoSaveState] = useState('idle');
  const toggleSection = (key) => setSections(prev => ({ ...prev, [key]: !prev[key] }));

  const setting = (key, fallback) => headerSettings?.[key] ?? fallback;
  const update = (key, value) => updateHeaderSettings((prev) => ({ ...(prev || {}), [key]: value }));
  const resolvedPreviewDefault = resolveLogoUrl(logoDraftDefault);
  const resolvedPreviewLight = resolveLogoUrl(logoDraftLight);
  const resolvedPreviewDark = resolveLogoUrl(logoDraftDark);

  useEffect(() => {
    setLogoDraftDefault(String(headerSettings?.logoUrl || ''));
    setLogoDraftLight(String(headerSettings?.logoUrlLight || ''));
    setLogoDraftDark(String(headerSettings?.logoUrlDark || ''));
    setLogoPreviewFailed(false);
    setLogoSaveState((prev) => (prev === 'error' ? 'idle' : prev));
  }, [headerSettings?.logoUrl, headerSettings?.logoUrlLight, headerSettings?.logoUrlDark]);

  const saveLogos = async () => {
    const nextDefault = String(logoDraftDefault || '').trim();
    const nextLight = String(logoDraftLight || '').trim();
    const nextDark = String(logoDraftDark || '').trim();
    const updatedAt = Date.now();
    setLogoSaveState('saving');
    updateHeaderSettings((prev) => ({
      ...(prev || {}),
      logoUrl: nextDefault,
      logoUrlLight: nextLight,
      logoUrlDark: nextDark,
      logoUpdatedAt: updatedAt,
    }));
    let persisted = false;
    let saveOk = true;
    if (typeof onSaveLogos === 'function') {
      try {
        const result = await onSaveLogos({
          logoUrl: nextDefault,
          logoUrlLight: nextLight,
          logoUrlDark: nextDark,
          updatedAt,
        });
        if (typeof result === 'boolean') {
          saveOk = result;
          persisted = true;
        } else if (result && typeof result === 'object') {
          saveOk = result.ok !== false;
          persisted = result.persisted !== false;
        } else {
          persisted = true;
        }
      } catch {
        saveOk = false;
      }
    }
    setLogoPreviewFailed(false);
    setLogoSavedAt(Date.now());
    setLogoSaveState(saveOk ? 'saved' : (persisted ? 'error' : 'saved'));
  };

  const fontWeight = setting('fontWeight', '300');
  const letterSpacing = setting('letterSpacing', 'normal');
  const clockFormat = setting('clockFormat', '24h');
  const fontStyle = setting('fontStyle', 'normal');
  const clockScale = setting('clockScale', 1.0);
  const dateScale = setting('dateScale', 1.0);

  return (
    <SidebarContainer
      open={open}
      onClose={onClose}
      title={t('system.tabHeader')}
      icon={Type}
    >
      <div className="space-y-2 font-sans">

        {/* Switcher Tab */}
        <div className="flex items-center justify-center mb-6">
          <div className="flex p-1 rounded-2xl border shadow-sm" style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}>
             <button
                className="w-12 h-9 rounded-xl flex items-center justify-center transition-all hover:text-white"
                style={{ color: 'var(--text-secondary)' }}
                onClick={onSwitchToTheme}
                title={t('system.tabAppearance')}
             >
                <Palette className="w-5 h-5" />
             </button>

             <div className="w-px my-1 mx-1" style={{ backgroundColor: 'var(--glass-border)' }} />

             <button
                className="w-12 h-9 rounded-xl flex items-center justify-center transition-all hover:text-white"
                style={{ color: 'var(--text-secondary)' }}
                onClick={onSwitchToLayout}
                title={t('system.tabLayout')}
             >
                <LayoutGrid className="w-5 h-5" />
             </button>

             <div className="w-px my-1 mx-1" style={{ backgroundColor: 'var(--glass-border)' }} />

             <button
                className="w-12 h-9 rounded-xl flex items-center justify-center transition-all text-white shadow-md relative z-10"
                style={{ backgroundColor: 'var(--accent-color)' }}
                disabled
                title={t('system.tabHeader')}
             >
                <Type className="w-5 h-5" />
             </button>
          </div>
        </div>
        
        {/* ── Typography Section ── */}
        <Section
          id="typography"
          icon={AlignLeft}
          title={t('header.fontFamily')}
          isOpen={sections.typography}
          toggle={toggleSection}
        >
          {/* Title Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('header.titleLabel')}</label>
            <input
              type="text"
              value={headerTitle}
              onChange={(e) => updateHeaderTitle(e.target.value)}
              placeholder={t('header.titlePlaceholder')}
              className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none transition-colors border"
              style={{ 
                  backgroundColor: 'var(--glass-bg)', 
                  borderColor: 'var(--glass-border)',
                  color: 'var(--text-primary)'
              }}
            />
          </div>

          {/* Logo URL */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {t('header.logoUrl') !== 'header.logoUrl' ? t('header.logoUrl') : 'Logo URL'}
            </label>
            <input
              type="url"
              value={logoDraftDefault}
              onChange={(e) => {
                setLogoDraftDefault(e.target.value);
                setLogoPreviewFailed(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveLogos();
                }
              }}
              placeholder={t('header.logoPlaceholder') !== 'header.logoPlaceholder' ? t('header.logoPlaceholder') : 'Fallback logo (all themes)'}
              className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none transition-colors border"
              style={{
                backgroundColor: 'var(--glass-bg)',
                borderColor: 'var(--glass-border)',
                color: 'var(--text-primary)'
              }}
            />
            <input
              type="url"
              value={logoDraftLight}
              onChange={(e) => {
                setLogoDraftLight(e.target.value);
                setLogoPreviewFailed(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveLogos();
                }
              }}
              placeholder={t('header.logoLightPlaceholder') !== 'header.logoLightPlaceholder' ? t('header.logoLightPlaceholder') : 'Light theme logo URL'}
              className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none transition-colors border"
              style={{
                backgroundColor: 'var(--glass-bg)',
                borderColor: 'var(--glass-border)',
                color: 'var(--text-primary)'
              }}
            />
            <input
              type="url"
              value={logoDraftDark}
              onChange={(e) => {
                setLogoDraftDark(e.target.value);
                setLogoPreviewFailed(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveLogos();
                }
              }}
              placeholder={t('header.logoDarkPlaceholder') !== 'header.logoDarkPlaceholder' ? t('header.logoDarkPlaceholder') : 'Dark theme logo URL'}
              className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none transition-colors border"
              style={{
                backgroundColor: 'var(--glass-bg)',
                borderColor: 'var(--glass-border)',
                color: 'var(--text-primary)'
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={saveLogos}
                disabled={logoSaveState === 'saving'}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all text-white"
                style={{
                  backgroundColor: 'var(--accent-color)',
                  borderColor: 'var(--accent-color)',
                }}
              >
                {t('header.saveLogo') !== 'header.saveLogo' ? t('header.saveLogo') : 'Save Logos'}
              </button>
              {(!!resolvedPreviewDefault || !!resolvedPreviewLight || !!resolvedPreviewDark || !!logoSavedAt) && (
                <span className="text-[10px] uppercase tracking-wider" style={{ color: logoPreviewFailed ? '#f87171' : 'var(--text-secondary)' }}>
                  {logoSaveState === 'saving'
                    ? (t('common.saving') !== 'common.saving' ? t('common.saving') : 'Saving...')
                    : logoSaveState === 'error'
                      ? (t('header.logoSaveFailed') !== 'header.logoSaveFailed' ? t('header.logoSaveFailed') : 'Save failed')
                      : logoPreviewFailed
                    ? (t('header.logoInvalid') !== 'header.logoInvalid' ? t('header.logoInvalid') : 'Image failed to load')
                    : (Date.now() - logoSavedAt < 2000
                      ? (t('header.logoSaved') !== 'header.logoSaved' ? t('header.logoSaved') : 'Saved')
                      : (t('header.logoPreview') !== 'header.logoPreview' ? t('header.logoPreview') : 'Preview'))}
                </span>
              )}
            </div>
            {(!!resolvedPreviewDefault || !!resolvedPreviewLight || !!resolvedPreviewDark) && !logoPreviewFailed && (
              <div className="space-y-2">
                {!!resolvedPreviewLight && (
                  <div className="w-full h-14 rounded-xl border flex items-center justify-center p-2" style={{ borderColor: 'var(--glass-border)', backgroundColor: '#ffffff' }}>
                    <img
                      src={resolvedPreviewLight}
                      alt="Light logo preview"
                      className="max-h-full max-w-full object-contain"
                      onError={() => setLogoPreviewFailed(true)}
                    />
                  </div>
                )}
                {!!resolvedPreviewDark && (
                  <div className="w-full h-14 rounded-xl border flex items-center justify-center p-2" style={{ borderColor: 'var(--glass-border)', backgroundColor: '#0b1220' }}>
                    <img
                      src={resolvedPreviewDark}
                      alt="Dark logo preview"
                      className="max-h-full max-w-full object-contain"
                      onError={() => setLogoPreviewFailed(true)}
                    />
                  </div>
                )}
                {!resolvedPreviewLight && !resolvedPreviewDark && !!resolvedPreviewDefault && (
                  <div className="w-full h-16 rounded-xl border flex items-center justify-center p-2" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg)' }}>
                    <img
                      src={resolvedPreviewDefault}
                      alt="Logo preview"
                      className="max-h-full max-w-full object-contain"
                      onError={() => setLogoPreviewFailed(true)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Font Family */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('header.fontFamily')}</label>
            <select
              value={setting('fontFamily', 'sans')}
              onChange={(e) => update('fontFamily', e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none appearance-none border"
              style={{ 
                  backgroundColor: 'var(--glass-bg)', 
                  borderColor: 'var(--glass-border)',
                  color: 'var(--text-primary)'
              }}
            >
              {FONTS.map(f => (
                <option key={f.value} value={f.value} className="bg-slate-800" style={{ color: 'white' }}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Weight */}
          <div className="space-y-2">
            <div className="flex justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('header.fontWeight')}</label>
            </div>
            <SegmentedControl
              options={FONT_WEIGHTS}
              value={fontWeight}
              onChange={(v) => update('fontWeight', v)}
            />
          </div>

          {/* Style */}
          <div className="space-y-2">
             <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('header.fontStyle')}</label>
             <div className="flex gap-2">
               {['normal', 'italic', 'uppercase'].map(s => (
                 <button
                   key={s}
                   onClick={() => update('fontStyle', s)}
                   className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                     fontStyle === s
                       ? 'text-white'
                       : 'hover:border-white/20'
                   }`}
                   style={fontStyle === s 
                      ? { backgroundColor: 'var(--accent-color)', borderColor: 'var(--accent-color)' }
                      : { backgroundColor: 'transparent', borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }
                   }
                 >
                   {s}
                 </button>
               ))}
             </div>
          </div>
        </Section>

        {/* ── Style/Size Section ── */}
        <Section
          id="style"
          icon={Maximize2}
          title={t('header.scale')}
          isOpen={sections.style}
          toggle={toggleSection}
        >
          {/* Header Scale */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('header.scale')}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums font-mono" style={{ color: 'var(--accent-color)' }}>{(headerScale * 100).toFixed(0)}%</span>
                {headerScale !== 1 && <ResetButton onClick={() => updateHeaderScale(1)} t={t} />}
              </div>
            </div>
            <M3Slider 
                min={0.5} 
                max={2.0} 
                step={0.1} 
                value={headerScale} 
                onChange={(e) => updateHeaderScale(parseFloat(e.target.value))} 
                colorClass="bg-blue-500" 
            />
          </div>

          {/* Letter Spacing */}
          <div className="space-y-2">
             <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('header.letterSpacing')}</label>
             <SegmentedControl
               options={LETTER_SPACINGS.map(l => ({ value: l.value, label: t(`header.letterSpacing.${l.value}`) || l.value }))}
               value={letterSpacing}
               onChange={(v) => update('letterSpacing', v)}
             />
          </div>

          {/* Clock Scale */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('header.clockScale')}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums font-mono" style={{ color: 'var(--accent-color)' }}>{(clockScale * 100).toFixed(0)}%</span>
                {clockScale !== 1 && <ResetButton onClick={() => update('clockScale', 1)} t={t} />}
              </div>
            </div>
            <M3Slider 
                min={0.5} 
                max={2.0} 
                step={0.1} 
                value={clockScale} 
                onChange={(e) => update('clockScale', parseFloat(e.target.value))} 
                colorClass="bg-blue-500" 
            />
          </div>

           {/* Date Scale */}
           <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('header.dateScale')}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums font-mono" style={{ color: 'var(--accent-color)' }}>{(dateScale * 100).toFixed(0)}%</span>
                {dateScale !== 1 && <ResetButton onClick={() => update('dateScale', 1)} t={t} />}
              </div>
            </div>
            <M3Slider 
                min={0.5} 
                max={2.0} 
                step={0.1} 
                value={dateScale} 
                onChange={(e) => update('dateScale', parseFloat(e.target.value))} 
                colorClass="bg-blue-500" 
            />
          </div>
        </Section>

        {/* ── Visibility/Clock Section ── */}
        <Section
          id="visibility"
          icon={Eye}
          title={t('header.visibility')}
          isOpen={sections.visibility}
          toggle={toggleSection}
        >
          <div className="space-y-1">
             <Toggle
               label={t('header.showTitle')}
               value={setting('showTitle', true)}
               onChange={(v) => update('showTitle', v)}
             />
             <Toggle
               label={t('header.showClock')}
               value={setting('showClock', true)}
               onChange={(v) => update('showClock', v)}
             />
             <Toggle
               label={t('header.showDate')}
               value={setting('showDate', true)}
               onChange={(v) => update('showDate', v)}
             />
          </div>

          <div className="space-y-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--glass-border)' }}>
             <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{t('header.clockFormat')}</label>
             <div className="flex gap-2">
               <button
                 onClick={() => update('clockFormat', '24h')}
                 className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                   clockFormat === '24h' ? 'text-white' : 'hover:text-white'
                 }`}
                 style={clockFormat === '24h' 
                    ? { backgroundColor: 'var(--accent-color)' } 
                    : { backgroundColor: 'var(--glass-bg)', color: 'var(--text-secondary)' }
                 }
               >
                 24h
               </button>
               <button
                 onClick={() => update('clockFormat', '12h')}
                 className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                   clockFormat === '12h' ? 'text-white' : 'hover:text-white'
                 }`}
                 style={clockFormat === '12h' 
                    ? { backgroundColor: 'var(--accent-color)' } 
                    : { backgroundColor: 'var(--glass-bg)', color: 'var(--text-secondary)' }
                 }
               >
                 12h
               </button>
             </div>
          </div>
        </Section>
      </div>
    </SidebarContainer>
  );
}
