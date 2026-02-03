/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AionUi base components unified exports
 *
 * Provides unified export entry for all base components and types
 */

// ==================== Component Exports ====================

export { default as AionCollapse } from './AionCollapse';
export { default as AionModal } from './AionModal';
export { default as AionScrollArea } from './AionScrollArea';
export { default as AionSelect } from './AionSelect';
export { default as AionSteps } from './AionSteps';

// ==================== Type Exports ====================

// AionModal types
export { MODAL_SIZES } from './AionModal';
export type { AionModalProps, ModalContentStyleConfig, ModalFooterConfig, ModalHeaderConfig, ModalSize } from './AionModal';

// AionCollapse types
export type { AionCollapseItemProps, AionCollapseProps } from './AionCollapse';

// AionSelect types
export type { AionSelectProps } from './AionSelect';

// AionSteps types
export type { AionStepsProps } from './AionSteps';
