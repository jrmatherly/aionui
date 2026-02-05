/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Slider } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useThemeContext } from '../context/ThemeContext';
import { FONT_SCALE_DEFAULT, FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from '../hooks/useFontScale';

// Floating point comparison tolerance
const EPSILON = 0.001;
const RESET_THRESHOLD = 0.01;

/**
 * Clamp value within valid font scale range
 * @param value - Value to clamp
 * @returns Clamped value
 */
const clamp = (value: number) => Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));

/**
 * Font size control component
 *
 * Provides interface scaling with slider and button controls
 */
const FontSizeControl: React.FC = () => {
  const { fontScale, setFontScale } = useThemeContext();

  // Format display value as percentage
  const formattedValue = useMemo(() => `${Math.round(fontScale * 100)}%`, [fontScale]);

  // Default mark (100% position)
  const defaultMarks = useMemo(
    () => ({
      1: <span className='font-scale-default-mark' aria-hidden='true' title='100%'></span>,
    }),
    []
  );

  /**
   * Handle slider value change
   * @param value - New scale value
   */
  const handleSliderChange = (value: number | number[]) => {
    if (typeof value === 'number') {
      void setFontScale(clamp(Number(value.toFixed(2))));
    }
  };

  /**
   * Handle step adjustment
   * @param delta - Step delta (positive to increase, negative to decrease)
   */
  const handleStep = (delta: number) => {
    const next = clamp(Number((fontScale + delta).toFixed(2)));
    void setFontScale(next);
  };

  /**
   * Reset to default value
   */
  const handleReset = () => {
    void setFontScale(FONT_SCALE_DEFAULT);
  };

  return (
    <div className='flex flex-col gap-2 w-full max-w-560px'>
      <div className='flex items-center gap-1 w-full'>
        <Button size='mini' type='secondary' onClick={() => handleStep(-FONT_SCALE_STEP)} disabled={fontScale <= FONT_SCALE_MIN + EPSILON}>
          -
        </Button>
        {/* Slider covers 80%-150% range and persists value */}
        <Slider className='flex-1 font-scale-slider p-0 m-0' showTicks min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={FONT_SCALE_STEP} value={fontScale} onChange={handleSliderChange} marks={defaultMarks} />
        <Button size='mini' type='secondary' onClick={() => handleStep(FONT_SCALE_STEP)} disabled={fontScale >= FONT_SCALE_MAX - EPSILON}>
          +
        </Button>
        <span className='text-13px text-t-secondary' style={{ minWidth: '48px' }}>
          {formattedValue}
        </span>
        <Button size='mini' type='text' className='p-0' onClick={handleReset} disabled={Math.abs(fontScale - FONT_SCALE_DEFAULT) < RESET_THRESHOLD}>
          {'Reset zoom'}
        </Button>
      </div>
    </div>
  );
};

export default FontSizeControl;
