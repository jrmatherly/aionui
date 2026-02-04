/**
 * @author Jason Matherly
 * @modified 2026-02-04
 * SPDX-License-Identifier: Apache-2.0
 */

import ApiKeysModalContent from '@/renderer/components/SettingsModal/contents/ApiKeysModalContent';
import React from 'react';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const ApiKeysSettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <ApiKeysModalContent />
    </SettingsPageWrapper>
  );
};

export default ApiKeysSettings;
