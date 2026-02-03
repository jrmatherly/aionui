import type { IMcpServer } from '@/common/storage';
import { useCallback, useState } from 'react';

/**
 * MCP Modal State Management Hook
 * Manages show/hide states and related data for all modals
 */
export const useMcpModal = () => {
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [editingMcpServer, setEditingMcpServer] = useState<IMcpServer | undefined>();
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<string | null>(null);
  const [mcpCollapseKey, setMcpCollapseKey] = useState<Record<string, boolean>>({});

  // Show add MCP server modal
  const showAddMcpModal = useCallback(() => {
    setEditingMcpServer(undefined);
    setShowMcpModal(true);
  }, []);

  // Show edit MCP server modal
  const showEditMcpModal = useCallback((server: IMcpServer) => {
    setEditingMcpServer(server);
    setShowMcpModal(true);
  }, []);

  // Hide MCP server modal
  const hideMcpModal = useCallback(() => {
    setShowMcpModal(false);
    setEditingMcpServer(undefined);
  }, []);

  // Show delete confirmation modal
  const showDeleteConfirm = useCallback((serverId: string) => {
    setServerToDelete(serverId);
    setDeleteConfirmVisible(true);
  }, []);

  // Hide delete confirmation modal
  const hideDeleteConfirm = useCallback(() => {
    setDeleteConfirmVisible(false);
    setServerToDelete(null);
  }, []);

  // Toggle server collapse state
  const toggleServerCollapse = useCallback((serverId: string) => {
    setMcpCollapseKey((prev) => ({ ...prev, [serverId]: !prev[serverId] }));
  }, []);

  return {
    // State
    showMcpModal,
    editingMcpServer,
    deleteConfirmVisible,
    serverToDelete,
    mcpCollapseKey,

    // Operation functions
    showAddMcpModal,
    showEditMcpModal,
    hideMcpModal,
    showDeleteConfirm,
    hideDeleteConfirm,
    toggleServerCollapse,
  };
};
