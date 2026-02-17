import { Suspense } from 'react';

const fallback = (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div className="text-white">Loading...</div>
  </div>
);

/**
 * Shared Suspense wrapper for lazy-loaded modals.
 */
export default function ModalSuspense({ children }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
