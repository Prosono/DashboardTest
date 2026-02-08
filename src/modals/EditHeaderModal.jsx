import { useState } from 'react';
import { X, Palette, ChevronDown, Maximize2, Clock, Eye, RefreshCw } from '../icons';
import M3Slider from '../components/M3Slider';

const FONTS = [
  { value: 'sans', label: 'Sans-serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
  { value: 'georgia', label: 'Georgia' },
  { value: 'courier', label: 'Courier' },
  { value: 'trebuchet', label: 'Trebuchet' },
  { value: 'times', label: 'Times' },
  { value: 'verdana', label: 'Verdana' },
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

/**
 * Side-drawer modal for editing header settings.
 * Dashboard is visible behind as live preview.
 */
export default function EditHeaderModal({
  show,
  onClose,
  headerTitle,
  headerScale,
  headerSettings,
  updateHeaderTitle,
  updateHeaderScale,
  updateHeaderSettings,
  t
}) {
  const [sections, setSections] = useState({ typography: true, style: false, clock: false, visibility: false });
  const toggleSection = (key) => setSections(prev => ({ ...prev, [key]: !prev[key] }));

  if (!show) return null;

  const setting = (key, fallback) => headerSettings?.[key] ?? fallback;
  const update = (key, value) => updateHeaderSettings({ ...headerSettings, [key]: value });

  const fontWeight = setting('fontWeight', '300');
  const letterSpacing = setting('letterSpacing', 'normal');
  const clockFormat = setting('clockFormat', '24h');
  const fontStyle = setting('fontStyle', 'normal');
  const clockScale = setting('clockScale', 1.0);
  const dateScale = setting('dateScale', 1.0);

  // ── Helpers ──
  const SegmentedControl = ({ options, value, onChange }) => (
    <div className="flex gap-1 p-0.5 rounded-xl bg-black/10">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 px-1 rounded-lg text-[11px] font-bold transition-all text-center ${
            value === opt.value
              ? 'bg-[var(--accent-color)] text-white shadow-lg shadow-[var(--accent-color)]/20'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const Toggle = ({ label, value, onChange }) => (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between py-2"
    >
      <span className="text-[12px] font-medium text-[var(--text-primary)]">{label}</span>
      <div className={`w-10 h-[22px] rounded-full relative transition-all ${value ? 'bg-blue-500/80' : 'bg-[var(--glass-bg-hover)]'}`}>
        <div className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all shadow-md ${value ? 'left-[calc(100%-19px)]' : 'left-[3px]'}`} />
      </div>
    </button>
  );

  const ResetButton = ({ onClick }) => (
    <button onClick={onClick} className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-hover)] transition-all" title="Reset">
      <RefreshCw className="w-3.5 h-3.5" />
    </button>
  );

  // Accordion section
  const Section = ({ id, icon: Icon, title, children }) => {
    const isOpen = sections[id];
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ backdropFilter: 'none', backgroundColor: 'transparent' }}
      onClick={onClose}
    >
      <style>{`
        .header-drawer-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .header-drawer-scroll::-webkit-scrollbar-track { background: transparent; }
        .header-drawer-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .header-drawer-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
      <div
        className="border w-full max-w-[18rem] sm:max-w-[21rem] md:max-w-[23rem] h-full rounded-none md:rounded-l-[2.5rem] shadow-2xl relative font-sans flex flex-col overflow-hidden text-[var(--text-primary)] origin-right animate-in slide-in-from-right-8 fade-in zoom-in-95 duration-300"
        style={{
          background: 'var(--modal-bg)',
          borderColor: 'var(--glass-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)] relative overflow-hidden bg-[var(--glass-bg)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">
            {t('modal.editHeader.title')}
          </h3>
          <button onClick={onClose} className="modal-close p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto header-drawer-scroll p-5 md:p-6">
          <div className="space-y-1 font-sans animate-in fade-in slide-in-from-right-4 duration-300">

            {/* ── Typography Section ── */}
            <Section id="typography" icon={Palette} title={t('header.titleLabel')}>
              {/* Title input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('header.titleLabel')}</span>
                </div>
                <input
                  type="text"
                  value={headerTitle}
                  onChange={(e) => updateHeaderTitle(e.target.value)}
                  placeholder={t('header.titlePlaceholder')}
                  className="w-full px-3 py-2 text-sm text-[var(--text-primary)] rounded-xl popup-surface focus:border-blue-500/50 outline-none transition-colors"
                />
              </div>

              {/* Font family */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('header.fontFamily')}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {FONTS.map(f => (
                    <button
                      key={f.value}
                      onClick={() => update('headerFont', f.value)}
                      className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-all text-center ${
                        setting('headerFont', 'sans') === f.value
                          ? 'bg-[var(--accent-color)] text-white shadow-lg shadow-[var(--accent-color)]/20'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 bg-black/10'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scale slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('header.scale')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{headerScale.toFixed(1)}x</span>
                    {headerScale !== 1.0 && <ResetButton onClick={() => updateHeaderScale(1.0)} />}
                  </div>
                </div>
                <M3Slider
                  min={0.5} max={2} step={0.1}
                  value={headerScale}
                  onChange={(e) => updateHeaderScale(parseFloat(e.target.value))}
                  colorClass="bg-blue-500"
                />
              </div>
            </Section>

            {/* ── Style Section ── */}
            <Section id="style" icon={Maximize2} title={t('header.fontStyle')}>
              {/* Font Weight */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('header.fontWeight')}</span>
                  {fontWeight !== '300' && <ResetButton onClick={() => update('fontWeight', '300')} />}
                </div>
                <SegmentedControl
                  options={FONT_WEIGHTS.map(fw => ({ value: fw.value, label: t(`header.fontWeight.${fw.key}`) }))}
                  value={fontWeight}
                  onChange={(v) => update('fontWeight', v)}
                />
              </div>

              {/* Letter Spacing */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('header.letterSpacing')}</span>
                  {letterSpacing !== 'normal' && <ResetButton onClick={() => update('letterSpacing', 'normal')} />}
                </div>
                <SegmentedControl
                  options={LETTER_SPACINGS.map(ls => ({ value: ls.value, label: t(`header.letterSpacing.${ls.value}`) }))}
                  value={letterSpacing}
                  onChange={(v) => update('letterSpacing', v)}
                />
              </div>

              {/* Font Style */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('header.fontStyle')}</span>
                  {fontStyle !== 'normal' && <ResetButton onClick={() => update('fontStyle', 'normal')} />}
                </div>
                <SegmentedControl
                  options={[
                    { value: 'normal', label: t('header.fontStyle.normal') },
                    { value: 'italic', label: t('header.fontStyle.italic') },
                    { value: 'uppercase', label: t('header.fontStyle.uppercase') },
                  ]}
                  value={fontStyle}
                  onChange={(v) => update('fontStyle', v)}
                />
              </div>
            </Section>

            {/* ── Clock Section ── */}
            <Section id="clock" icon={Clock} title={t('header.clockFormat')}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('header.clockFormat')}</span>
                  {clockFormat !== '24h' && <ResetButton onClick={() => update('clockFormat', '24h')} />}
                </div>
                <SegmentedControl
                  options={[
                    { value: '24h', label: t('header.clockFormat.24h') },
                    { value: '12h', label: t('header.clockFormat.12h') },
                  ]}
                  value={clockFormat}
                  onChange={(v) => update('clockFormat', v)}
                />
              </div>

              {/* Clock size */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('header.clockScale')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{clockScale.toFixed(1)}x</span>
                    {clockScale !== 1.0 && <ResetButton onClick={() => update('clockScale', 1.0)} />}
                  </div>
                </div>
                <M3Slider
                  min={0.5} max={2} step={0.1}
                  value={clockScale}
                  onChange={(e) => update('clockScale', parseFloat(e.target.value))}
                  colorClass="bg-blue-500"
                />
              </div>

              {/* Date size */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">{t('header.dateScale')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{dateScale.toFixed(1)}x</span>
                    {dateScale !== 1.0 && <ResetButton onClick={() => update('dateScale', 1.0)} />}
                  </div>
                </div>
                <M3Slider
                  min={0.5} max={2} step={0.1}
                  value={dateScale}
                  onChange={(e) => update('dateScale', parseFloat(e.target.value))}
                  colorClass="bg-blue-500"
                />
              </div>
            </Section>

            {/* ── Visibility Section ── */}
            <Section id="visibility" icon={Eye} title={t('header.visibility')}>
              <Toggle label={t('header.showTitle')} value={headerSettings.showTitle} onChange={(v) => update('showTitle', v)} />
              <Toggle label={t('header.showClock')} value={headerSettings.showClock} onChange={(v) => update('showClock', v)} />
              <Toggle label={t('header.showDate')} value={headerSettings.showDate} onChange={(v) => update('showDate', v)} />
            </Section>

          </div>
        </div>
      </div>
    </div>
  );
}
