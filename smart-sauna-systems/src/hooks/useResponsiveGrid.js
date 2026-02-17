import { useState, useEffect } from 'react';
import { MOBILE_BREAKPOINT } from '../config/constants';

/**
 * Responsive grid column count, mobile detection & compact-card flag.
 *
 * @param {number} gridColumns – user-chosen max column count
 * @returns {{ gridColCount, isCompactCards, isMobile }}
 */
export function useResponsiveGrid(gridColumns) {
  const [gridColCount, setGridColCount] = useState(1);
  const [isCompactCards, setIsCompactCards] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setIsMobile(w < MOBILE_BREAKPOINT);
      if (w >= 1280) setGridColCount(gridColumns);
      else if (w >= 1024) setGridColCount(Math.min(gridColumns, 3));
      else setGridColCount(2);
      setIsCompactCards(w >= 480 && w < 640);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [gridColumns]);

  return { gridColCount, isCompactCards, isMobile };
}
