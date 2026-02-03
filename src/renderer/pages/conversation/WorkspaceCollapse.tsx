/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Down } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';

interface WorkspaceCollapseProps {
  /** Whether the panel is expanded */
  expanded: boolean;
  /** Callback to toggle expanded state */
  onToggle: () => void;
  /** Title of the collapsible panel */
  header: React.ReactNode;
  /** Content of the collapsible panel */
  children: React.ReactNode;
  /** Additional class name */
  className?: string;
  /** Whether the sidebar is collapsed - hides group title and removes indent when collapsed */
  siderCollapsed?: boolean;
}

/**
 * Workspace collapse component - simple collapsible panel for workspace grouping
 */
const WorkspaceCollapse: React.FC<WorkspaceCollapseProps> = ({ expanded, onToggle, header, children, className, siderCollapsed = false }) => {
  // When sidebar is collapsed, force expand content and hide header
  const showContent = siderCollapsed || expanded;

  return (
    <div className={classNames('workspace-collapse min-w-0', className)}>
      {/* Collapsible header - hidden when sidebar is collapsed */}
      {!siderCollapsed && (
        <div className='flex items-center ml-2px gap-8px h-32px p-4px cursor-pointer hover:bg-hover rd-4px transition-colors min-w-0' onClick={onToggle}>
          {/* Expand/collapse arrow */}
          <Down size={16} className={classNames('line-height-0 transition-transform duration-200 flex-shrink-0', expanded ? 'rotate-0' : '-rotate-90')} />

          {/* Title content */}
          <div className='flex-1 ml-6px min-w-0 overflow-hidden'>{header}</div>
        </div>
      )}

      {/* Collapsible content - removes left margin when sidebar is collapsed */}
      {showContent && <div className={classNames('workspace-collapse-content min-w-0', { 'ml-8px': !siderCollapsed })}>{children}</div>}
    </div>
  );
};

export default WorkspaceCollapse;
