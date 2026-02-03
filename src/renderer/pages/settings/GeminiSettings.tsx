/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import GeminiModalContent from '@/renderer/components/SettingsModal/contents/GeminiModalContent';
import React from 'react';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const GeminiSettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <GeminiModalContent />
    </SettingsPageWrapper>
  );
};

export default GeminiSettings;
