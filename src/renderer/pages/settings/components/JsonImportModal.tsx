import type { IMcpServer, IMcpServerTransport, IMcpTool } from '@/common/storage';
import AionModal from '@/renderer/components/base/AionModal';
import { useThemeContext } from '@/renderer/context/ThemeContext';
import { Alert, Button } from '@arco-design/web-react';
import { json } from '@codemirror/lang-json';
import CodeMirror from '@uiw/react-codemirror';
import React, { useCallback, useState } from 'react';
interface JsonImportModalProps {
  visible: boolean;
  server?: IMcpServer;
  onCancel: () => void;
  onSubmit: (server: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onBatchImport?: (servers: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => void;
}

interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

const JsonImportModal: React.FC<JsonImportModalProps> = ({ visible, server, onCancel, onSubmit, onBatchImport }) => {
  const { theme } = useThemeContext();
  const [jsonInput, setJsonInput] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true });

  /**
   * JSON syntax validation
   */
  const validateJsonSyntax = useCallback((input: string): ValidationResult => {
    if (!input.trim()) {
      return { isValid: true }; // Empty value is considered valid
    }

    try {
      JSON.parse(input);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        errorMessage: error instanceof SyntaxError ? error.message : 'Invalid JSON format',
      };
    }
  }, []);

  // Watch jsonInput changes, update validation result in real-time
  React.useEffect(() => {
    setValidation(validateJsonSyntax(jsonInput));
  }, [jsonInput, validateJsonSyntax]);

  // Pre-fill JSON data when editing an existing server
  React.useEffect(() => {
    if (visible && server) {
      // Prefer stored originalJson, otherwise generate JSON config
      if (server.originalJson) {
        setJsonInput(server.originalJson);
      } else {
        // Backward compatibility for old data without originalJson, generate JSON config
        const serverConfig = {
          mcpServers: {
            [server.name]: {
              description: server.description,
              ...(server.transport.type === 'stdio'
                ? {
                    command: server.transport.command,
                    args: server.transport.args || [],
                    env: server.transport.env || {},
                  }
                : {
                    type: server.transport.type,
                    url: server.transport.url,
                    ...(server.transport.headers && { headers: server.transport.headers }),
                  }),
            },
          },
        };
        setJsonInput(JSON.stringify(serverConfig, null, 2));
      }
    } else if (visible && !server) {
      // Clear JSON input in create mode
      setJsonInput('');
    }
  }, [visible, server]);

  const handleSubmit = () => {
    // Syntax validation already passed (guaranteed by button disable logic), parse directly
    const config = JSON.parse(jsonInput);
    const mcpServers = config.mcpServers || config;

    if (Array.isArray(mcpServers)) {
      // TODO: Support array format import
      console.warn('Array format not supported yet');
      return;
    }

    const serverKeys = Object.keys(mcpServers);
    if (serverKeys.length === 0) {
      console.warn('No MCP server found in configuration');
      return;
    }

    // If there are multiple servers, use batch import
    if (serverKeys.length > 1 && onBatchImport) {
      const serversToImport = serverKeys.map((serverKey) => {
        const serverConfig = mcpServers[serverKey];
        const transport: IMcpServerTransport = serverConfig.command
          ? {
              type: 'stdio',
              command: serverConfig.command,
              args: serverConfig.args || [],
              env: serverConfig.env || {},
            }
          : serverConfig.type === 'sse' || serverConfig.url?.includes('/sse')
            ? {
                type: 'sse',
                url: serverConfig.url,
                headers: serverConfig.headers,
              }
            : serverConfig.type === 'streamable_http'
              ? {
                  type: 'streamable_http',
                  url: serverConfig.url,
                  headers: serverConfig.headers,
                }
              : {
                  type: 'http',
                  url: serverConfig.url,
                  headers: serverConfig.headers,
                };

        return {
          name: serverKey,
          description: serverConfig.description || `Imported from JSON`,
          enabled: true,
          transport,
          status: 'disconnected' as const,
          tools: [] as IMcpTool[], // Initialize as empty array on JSON import, can be fetched via connection test later
          originalJson: JSON.stringify({ mcpServers: { [serverKey]: serverConfig } }, null, 2),
        };
      });

      onBatchImport(serversToImport);
      onCancel();
      return;
    }

    // Single server import
    const firstServerKey = serverKeys[0];
    const serverConfig = mcpServers[firstServerKey];
    const transport: IMcpServerTransport = serverConfig.command
      ? {
          type: 'stdio',
          command: serverConfig.command,
          args: serverConfig.args || [],
          env: serverConfig.env || {},
        }
      : serverConfig.type === 'sse' || serverConfig.url?.includes('/sse')
        ? {
            type: 'sse',
            url: serverConfig.url,
            headers: serverConfig.headers,
          }
        : serverConfig.type === 'streamable_http'
          ? {
              type: 'streamable_http',
              url: serverConfig.url,
              headers: serverConfig.headers,
            }
          : {
              type: 'http',
              url: serverConfig.url,
              headers: serverConfig.headers,
            };

    onSubmit({
      name: firstServerKey,
      description: serverConfig.description,
      enabled: true,
      transport,
      status: 'disconnected',
      tools: [] as IMcpTool[], // Initialize as empty array on JSON import, can be fetched via connection test later
      originalJson: jsonInput,
    });
    onCancel();
  };

  if (!visible) return null;

  return (
    <AionModal
      visible={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okButtonProps={{ disabled: !validation.isValid }}
      header={{ title: server ? 'Edit' : 'Import from JSON', showClose: true }}
      style={{ width: 600, height: 450 }}
      contentStyle={{ borderRadius: 16, padding: '24px', background: 'var(--bg-1)', overflow: 'auto', height: 420 - 80 }} // Keep same size as Add Model modal
    >
      <div className='space-y-12px'>
        <div>
          <div className='mb-2 text-sm text-t-secondary'>{'Copy the JSON configuration from the MCP service introduction page (preferably NPX or UVX configuration) and paste it into the input box below.'}</div>
          <div className='relative'>
            <CodeMirror
              value={jsonInput}
              height='300px'
              theme={theme}
              extensions={[json()]}
              onChange={(value: string) => setJsonInput(value)}
              placeholder={`{
  "mcpServers": {
    "weather": {
      "command": "uv",
      "args": ["--directory", "/path/to/weather", "run", "weather.py"],
      "description": "Weather information server"
    }
  }
}`}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                dropCursor: false,
                allowMultipleSelections: false,
              }}
              style={{
                fontSize: '13px',
                border: validation.isValid || !jsonInput.trim() ? '1px solid var(--bg-3)' : '1px solid var(--danger)',
                borderRadius: '6px',
                marginBottom: '20px',
                overflow: 'hidden',
              }}
              className='[&_.cm-editor]:rounded-[6px]'
            />
            {jsonInput && (
              <Button
                size='mini'
                type='outline'
                className='absolute top-2 right-2 z-10'
                onClick={() => {
                  const copyToClipboard = async () => {
                    try {
                      if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(jsonInput);
                      } else {
                        // Fallback to legacy method
                        const textArea = document.createElement('textarea');
                        textArea.value = jsonInput;
                        textArea.style.position = 'fixed';
                        textArea.style.left = '-9999px';
                        textArea.style.top = '-9999px';
                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                      }
                      setCopyStatus('success');
                      setTimeout(() => setCopyStatus('idle'), 2000);
                    } catch (err) {
                      console.error('Copy failed:', err);
                      setCopyStatus('error');
                      setTimeout(() => setCopyStatus('idle'), 2000);
                    }
                  };

                  void copyToClipboard();
                }}
                style={{
                  backdropFilter: 'blur(4px)',
                }}
              >
                {copyStatus === 'success' ? 'Copied' : copyStatus === 'error' ? 'Copy failed' : 'Copy'}
              </Button>
            )}
          </div>

          {/* JSON format error message */}
          {!validation.isValid && jsonInput.trim() && <div className='mt-2 text-sm text-red-600'>{'JSON format error'}</div>}
        </div>

        <Alert
          type='info'
          showIcon
          content={
            <div>
              <div>{'Import Tips'}</div>
              <ul className='list-disc pl-5 mt-2 space-y-1 text-sm'>
                <li>{'Supports mcpServers object format from Claude Desktop config'}</li>
                <li>{'Multiple servers can be imported at once'}</li>
                <li>{'Server names must be unique'}</li>
              </ul>
            </div>
          }
        />
      </div>
    </AionModal>
  );
};

export default JsonImportModal;
