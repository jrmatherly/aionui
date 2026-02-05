import type { IMcpServer } from '@/common/storage';
import type { McpOAuthStatus } from '@/renderer/hooks/mcp/useMcpOAuth';
import { iconColors } from '@/renderer/theme/colors';
import { Button, Dropdown, Menu, Switch, Tooltip } from '@arco-design/web-react';
import { Check, CloseOne, CloseSmall, DeleteFour, LoadingOne, Login, Refresh, SettingOne, Write } from '@icon-park/react';
import React from 'react';
import McpAgentStatusDisplay from './McpAgentStatusDisplay';

interface McpServerHeaderProps {
  server: IMcpServer;
  agentInstallStatus: Record<string, string[]>;
  isServerLoading: (serverName: string) => boolean;
  isTestingConnection: boolean;
  oauthStatus?: McpOAuthStatus;
  isLoggingIn?: boolean;
  onTestConnection: (server: IMcpServer) => void;
  onEditServer: (server: IMcpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onToggleServer: (serverId: string, enabled: boolean) => void;
  onOAuthLogin?: (server: IMcpServer) => void;
}

const getStatusIcon = (status?: IMcpServer['status'], oauthStatus?: McpOAuthStatus) => {
  if (status === 'testing' || oauthStatus?.isChecking) {
    return <LoadingOne fill={iconColors.primary} className='h-[24px]' />;
  }

  if (status === 'error') {
    return <CloseSmall fill={iconColors.danger} className='h-[24px]' />;
  }

  if (oauthStatus?.needsLogin) {
    return <span className='text-orange-500 text-xl font-bold leading-none'>△</span>;
  }

  if (status === 'connected' || oauthStatus?.isAuthenticated) {
    return <Check fill={iconColors.success} className='h-[24px] items-center' />;
  }

  return <CloseOne fill={iconColors.secondary} className='h-[24px]' />;
};

const getStatusText = (status?: IMcpServer['status'], oauthStatus?: McpOAuthStatus) => {
  // Priority 1: Testing status
  if (status === 'testing' || oauthStatus?.isChecking) {
    return 'testing';
  }

  // Priority 2: Error status
  if (status === 'error') {
    return 'error';
  }

  // Priority 3: OAuth requires login
  if (oauthStatus?.needsLogin) {
    return 'disconnected · Enter to login';
  }

  // Priority 4: Connected or authenticated
  if (status === 'connected' || oauthStatus?.isAuthenticated) {
    return 'connected';
  }

  // Default: Disconnected
  return 'disconnected';
};

const McpServerHeader: React.FC<McpServerHeaderProps> = ({ server, agentInstallStatus, isServerLoading, isTestingConnection, oauthStatus, isLoggingIn, onTestConnection, onEditServer, onDeleteServer, onToggleServer, onOAuthLogin }) => {
  // Check if OAuth is supported (HTTP/SSE only)
  const supportsOAuth = server.transport.type === 'http' || server.transport.type === 'sse';
  const needsLogin = supportsOAuth && oauthStatus?.needsLogin;
  const statusText = getStatusText(server.status, oauthStatus);
  const statusIcon = getStatusIcon(server.status, oauthStatus);

  return (
    <div className='flex items-center justify-between group'>
      <div className='flex items-center gap-2'>
        <span>{server.name}</span>
        <Tooltip content={statusText} position='top'>
          <span className='flex items-center cursor-default'>{statusIcon}</span>
        </Tooltip>
        {needsLogin && onOAuthLogin && (
          <Button size='mini' type='primary' icon={<Login size={'14'} />} title={'OAuth Login'} loading={isLoggingIn} onClick={() => onOAuthLogin(server)}>
            {'Login'}
          </Button>
        )}
        {!needsLogin && <Button size='mini' icon={<Refresh size={'14'} />} title={'Check MCP Availability'} loading={isTestingConnection} onClick={() => onTestConnection(server)} />}
      </div>
      <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
        <div className='flex items-center gap-2 invisible group-hover:visible'>
          {/* agents */}
          <McpAgentStatusDisplay serverName={server.name} agentInstallStatus={agentInstallStatus} isLoadingAgentStatus={isServerLoading(server.name)} />
          <Dropdown
            trigger='hover'
            droplist={
              <Menu>
                <Menu.Item key='edit' onClick={() => onEditServer(server)}>
                  <div className='flex items-center gap-2'>
                    <Write size={'14'} />
                    {'Edit'}
                  </div>
                </Menu.Item>
                <Menu.Item key='delete' onClick={() => onDeleteServer(server.id)}>
                  <div className='flex items-center gap-2 text-red-500'>
                    <DeleteFour size={'14'} />
                    {'Delete'}
                  </div>
                </Menu.Item>
              </Menu>
            }
          >
            <Button size='mini' icon={<SettingOne size={'14'} />} />
          </Dropdown>
        </div>
        <Switch checked={server.enabled} onChange={(checked) => onToggleServer(server.id, checked)} size='small' disabled={server.status === 'testing'} />
      </div>
    </div>
  );
};

export default McpServerHeader;
