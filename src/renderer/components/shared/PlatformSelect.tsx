/**
 * @author Jason Matherly
 * @modified 2026-02-05
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared platform selector with provider logos, search, and optional sorting.
 * Single source of truth for platform dropdown UI across settings and admin.
 */

import { MODEL_PLATFORMS, type PlatformConfig } from '@/renderer/config/modelPlatforms';
import { Select } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { renderPlatformOption } from './ProviderLogo';

interface PlatformSelectProps {
  /** Current selected platform value */
  value?: string;
  /** Change handler */
  onChange?: (value: string, platform: PlatformConfig | undefined) => void;
  /** Sort platforms alphabetically (default: true) */
  sorted?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Additional props passed to Arco Select */
  disabled?: boolean;
}

/**
 * Platform selector dropdown with provider logos.
 * Wraps Arco Select with logo rendering, searchability, and sorted platform list.
 */
const PlatformSelect: React.FC<PlatformSelectProps> = ({ value, onChange, sorted = true, placeholder = 'Select platform', disabled }) => {
  const platforms = useMemo(() => {
    if (!sorted) return MODEL_PLATFORMS;
    return [...MODEL_PLATFORMS].sort((a, b) => a.name.localeCompare(b.name));
  }, [sorted]);

  return (
    <Select
      value={value}
      placeholder={placeholder}
      showSearch
      disabled={disabled}
      onChange={(val: string) => {
        const plat = platforms.find((p) => p.value === val);
        onChange?.(val, plat);
      }}
      filterOption={(inputValue, option) => {
        const optionValue = (option as React.ReactElement<{ value?: string }>)?.props?.value;
        const plat = platforms.find((p) => p.value === optionValue);
        return plat?.name.toLowerCase().includes(inputValue.toLowerCase()) ?? false;
      }}
      renderFormat={(option) => {
        const optionValue = (option as { value?: string })?.value;
        const plat = platforms.find((p) => p.value === optionValue);
        if (!plat) return optionValue;
        return renderPlatformOption(plat);
      }}
    >
      {platforms.map((plat) => (
        <Select.Option key={plat.value} value={plat.value}>
          {renderPlatformOption(plat)}
        </Select.Option>
      ))}
    </Select>
  );
};

export default PlatformSelect;
