import React, { useEffect } from 'react';
import { X } from '../../icons';

export default function SidebarContainer({ 
  open, 
  onClose, 
  title, 
  children,
  icon: Icon
}) {
  // Close on escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  // Prevent scroll on body when open - DISABLED for better live preview
  /* 
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  */

  return (
    <>
      {/* Backdrop - Removed blur and reduced opacity so changes can be seen clearly */}
      <div 
        className={`fixed inset-0 z-[100] bg-black/5 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sidebar Panel */}
      <div 
        className={`fixed inset-y-0 right-0 z-[101] w-full max-w-[360px] backdrop-blur-xl border-l shadow-2xl transform transition-transform duration-500 cubic-bezier(0.34, 1.56, 0.64, 1) ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ 
          backgroundColor: 'var(--modal-bg)', 
          borderColor: 'var(--card-border)' 
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div 
             className="flex items-center justify-between px-6 py-5 border-b"
             style={{ borderColor: 'var(--card-border)' }}
          >
            <div className="flex items-center gap-3">
               {Icon && (
                 <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent-color)' }}>
                   <Icon className="w-5 h-5" />
                 </div>
               )}
               <h2 className="text-lg font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>
                {title}
              </h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-full transition-colors"
                style={{ color: 'var(--text-secondary)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
