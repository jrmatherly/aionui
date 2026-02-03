/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { IconLeft, IconRight } from '@arco-design/web-react/icon';
import React, { useEffect, useRef, useState } from 'react';

interface HorizontalFileListProps {
  children: React.ReactNode;
}

/**
 * Horizontal scrolling file list component
 * Supports left/right scrolling with auto show/hide scroll buttons
 * Used for horizontal display of file preview lists
 */
const HorizontalFileList: React.FC<HorizontalFileListProps> = ({ children }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  /**
   * Check scroll state to determine whether to show left/right scroll buttons
   * Calculate if container is scrollable and if currently at start/end position
   */
  const checkScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Check if horizontal scrolling is available
    const hasScroll = container.scrollWidth > container.clientWidth;
    // Check if at start position (left edge)
    const isAtStart = container.scrollLeft <= 1;
    // Check if at end position (right edge)
    const isAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 1;

    const nextShowScrollButton = hasScroll;
    const nextCanScrollRight = hasScroll && !isAtEnd;
    const nextCanScrollLeft = hasScroll && !isAtStart;

    // Only update state when it actually changes to avoid unnecessary re-renders
    setShowScrollButton((prev) => (prev !== nextShowScrollButton ? nextShowScrollButton : prev));
    setCanScrollRight((prev) => (prev !== nextCanScrollRight ? nextCanScrollRight : prev));
    setCanScrollLeft((prev) => (prev !== nextCanScrollLeft ? nextCanScrollLeft : prev));
  }, []);

  useEffect(() => {
    checkScroll();
    const container = scrollContainerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const scheduleCheck = () => {
      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(checkScroll);
      } else {
        checkScroll();
      }
    };

    // Use ResizeObserver to listen for container size changes and auto-update scroll state
    // ResizeObserver handles most layout changes well
    const resizeObserver = new ResizeObserver(scheduleCheck);
    resizeObserver.observe(container);

    // Listen for scroll events to update button display state in real-time
    container.addEventListener('scroll', checkScroll, { passive: true });

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
      container.removeEventListener('scroll', checkScroll);
    };
  }, [checkScroll]);

  // Also check once when children change, but no need to add as useEffect dependency to avoid frequent re-runs
  useEffect(() => {
    checkScroll();
  }, [children, checkScroll]);

  /**
   * Scroll right by 200px
   */
  const handleScrollRight = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: 200,
      behavior: 'smooth',
    });
  };

  /**
   * Scroll left by 200px
   */
  const handleScrollLeft = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: -200,
      behavior: 'smooth',
    });
  };

  return (
    <div className='relative'>
      {/* Horizontal scroll container with hidden scrollbar */}
      <div
        ref={scrollContainerRef}
        className='flex items-center gap-8px overflow-x-auto overflow-y-hidden scrollbar-hide pt-5px pb-5px'
        style={{
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
        }}
      >
        {children}
      </div>
      {/* Left scroll button - shown when not at start position */}
      {showScrollButton && canScrollLeft && (
        <div
          className='absolute left-0 top-0 h-full flex items-center cursor-pointer'
          style={{
            background: 'linear-gradient(to left, transparent, var(--dialog-fill-0) 30%)', // Left gradient mask
            width: '60px',
            pointerEvents: 'none', // Mask layer does not respond to clicks
          }}
        >
          <button
            onClick={handleScrollLeft}
            className='ml-0px w-28px h-28px rd-50% bg-1 flex items-center justify-center hover:bg-2 transition-colors border-1 border-solid b-color-border-2'
            style={{
              pointerEvents: 'auto', // Button responds to clicks
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <IconLeft style={{ fontSize: '14px', color: 'var(--text-t-primary)' }} />
          </button>
        </div>
      )}
      {/* Right scroll button - shown when not at end position */}
      {showScrollButton && canScrollRight && (
        <div
          className='absolute right-0 top-0 h-full flex items-center cursor-pointer'
          style={{
            background: 'linear-gradient(to right, transparent, var(--dialog-fill-0) 30%)', // Right gradient mask
            width: '60px',
            pointerEvents: 'none', // Mask layer does not respond to clicks
          }}
        >
          <button
            onClick={handleScrollRight}
            className='ml-auto mr-0px w-28px h-28px rd-50% bg-1 flex items-center justify-center hover:bg-2 transition-colors border-1 border-solid b-color-border-2'
            style={{
              pointerEvents: 'auto', // Button responds to clicks
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <IconRight style={{ fontSize: '14px', color: 'var(--text-t-primary)' }} />
          </button>
        </div>
      )}
    </div>
  );
};

export default HorizontalFileList;
