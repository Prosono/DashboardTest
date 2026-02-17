import React from 'react';
import { X } from 'lucide-react';
import IconPicker from '../components/ui/IconPicker';

const EditPageModal = ({ 
  isOpen, 
  onClose, 
  t, 
  editingPage, 
  pageSettings, 
  savePageSetting,
  pageDefaults,
  onDelete 
}) => {
  if (!isOpen) return null;
  const visibleRoles = Array.isArray(pageSettings[editingPage]?.visibleRoles) ? pageSettings[editingPage].visibleRoles : [];
  const roleOptions = [
    { id: 'admin', label: t('role.admin') || 'Admin' },
    { id: 'user', label: t('role.user') || 'User' },
    { id: 'inspector', label: t('role.inspector') || 'Inspector' },
  ];
  const toggleVisibleRole = (roleId) => {
    const next = visibleRoles.includes(roleId)
      ? visibleRoles.filter((id) => id !== roleId)
      : [...visibleRoles, roleId];
    savePageSetting(editingPage, 'visibleRoles', next.length ? next : null);
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4" style={{
      backdropFilter: 'blur(20px)', 
      backgroundColor: 'rgba(0,0,0,0.3)'
    }} onClick={onClose}>
      <div className="border w-full max-w-lg rounded-2xl sm:rounded-3xl md:rounded-[3rem] p-4 sm:p-6 md:p-8 shadow-2xl relative font-sans backdrop-blur-xl popup-anim mt-3 sm:mt-0" style={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)', 
        borderColor: 'var(--glass-border)', 
        color: 'var(--text-primary)'
      }} onClick={(e) => e.stopPropagation()}>
         <button onClick={onClose} className="absolute top-4 right-4 md:top-6 md:right-6 modal-close"><X className="w-4 h-4" /></button>
         <h3 className="text-2xl font-light mb-4 text-[var(--text-primary)] uppercase tracking-widest italic">{t('modal.editPage.title')}</h3>
         
         <div className="space-y-5">
           <div className="space-y-2">
             <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('form.name')}</label>
             <input 
               type="text" 
               className="w-full px-4 py-3 text-[var(--text-primary)] rounded-2xl popup-surface focus:border-blue-500/50 outline-none transition-colors"
               value={pageSettings[editingPage]?.label || pageDefaults[editingPage]?.label || editingPage}
               onChange={(e) => {
                savePageSetting(editingPage, 'label', e.target.value);
               }}
             />
           </div>
           
          <div className="space-y-2">
            <label className="text-xs uppercase font-bold text-gray-500 ml-1">{t('form.chooseIcon')}</label>
            <IconPicker
              value={pageSettings[editingPage]?.icon || null}
              onSelect={(iconName) => {
                savePageSetting(editingPage, 'icon', iconName);
              }}
              onClear={() => {
                savePageSetting(editingPage, 'icon', null);
              }}
              t={t}
              maxHeightClass="max-h-72"
            />
          </div>
           
           <div className="flex items-center justify-between px-4 py-3 rounded-2xl popup-surface">
              <span className="text-xs uppercase font-bold text-gray-500 tracking-widest">{t('form.hidePage')}</span>
              <button 
                onClick={() => {
                  savePageSetting(editingPage, 'hidden', !pageSettings[editingPage]?.hidden);
                }}
                className={`w-12 h-6 rounded-full transition-colors relative ${pageSettings[editingPage]?.hidden ? 'bg-blue-500' : 'bg-[var(--glass-bg-hover)]'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${pageSettings[editingPage]?.hidden ? 'left-7' : 'left-1'}`} />
              </button>
           </div>

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
                 onClick={() => savePageSetting(editingPage, 'visibleRoles', null)}
                 className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
               >
                 {t('form.visibilityAllRoles') || 'Allow all roles'}
               </button>
               <p className="text-[10px] text-[var(--text-secondary)]">
                 {t('form.visibilityHint') || 'If nothing is selected, all roles can see this page.'}
               </p>
             </div>
           </div>

           {editingPage !== 'home' && (
             <button
               onClick={() => onDelete(editingPage)}
               className="w-full py-2.5 rounded-2xl bg-red-500/10 text-red-400 font-bold uppercase tracking-widest hover:bg-red-500/15 transition-colors"
             >
               {t('form.deletePage')}
             </button>
           )}

           <button
             onClick={onClose}
             className="w-full py-3 rounded-2xl bg-[var(--glass-bg-hover)] text-[var(--text-primary)] font-bold uppercase tracking-widest hover:bg-[var(--glass-bg)] transition-colors"
           >
             {t('common.ok')}
           </button>
         </div>
      </div>
    </div>
  );
};
export default EditPageModal;
