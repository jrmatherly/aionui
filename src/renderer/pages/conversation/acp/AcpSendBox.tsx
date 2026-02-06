import { ipcBridge } from '@/common';
import { transformMessage, type TMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import FilePreview from '@/renderer/components/FilePreview';
import HorizontalFileList from '@/renderer/components/HorizontalFileList';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/ThoughtDisplay';
import SendBox from '@/renderer/components/sendbox';
import { useAutoTitle } from '@/renderer/hooks/useAutoTitle';
import { useLatestRef } from '@/renderer/hooks/useLatestRef';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/useSendBoxFiles';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/theme/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/fileSelection';
import { createLogger } from '@/renderer/utils/logger';
import type { AcpBackend } from '@/types/acpTypes';
import { Button, Progress, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const log = createLogger('AcpSendBox');
const useAcpSendBoxDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useAcpMessage = (conversation_id: string) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [acpStatus, setAcpStatus] = useState<'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error' | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false); // New loading state for AI response
  const [ingestionProgress, setIngestionProgress] = useState<{
    status: 'start' | 'ingesting' | 'success' | 'error' | 'complete' | 'stage';
    current?: number;
    total: number;
    fileName?: string;
    successCount?: number;
    failedCount?: number;
    stage?: string;
    detail?: string;
    percent?: number;
  } | null>(null);

  // Throttle thought updates to reduce render frequency
  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50;
    return (data: ThoughtData) => {
      const now = Date.now();
      const ref = thoughtThrottleRef.current;
      if (now - ref.lastUpdate >= THROTTLE_MS) {
        ref.lastUpdate = now;
        ref.pending = null;
        if (ref.timer) {
          clearTimeout(ref.timer);
          ref.timer = null;
        }
        setThought(data);
      } else {
        ref.pending = data;
        if (!ref.timer) {
          ref.timer = setTimeout(
            () => {
              ref.lastUpdate = Date.now();
              ref.timer = null;
              if (ref.pending) {
                setThought(ref.pending);
                ref.pending = null;
              }
            },
            THROTTLE_MS - (now - ref.lastUpdate)
          );
        }
      }
    };
  }, []);

  // Clear throttle timer
  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  const handleResponseMessage = useCallback(
    (message: IResponseMessage) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      const transformedMessage = transformMessage(message);
      switch (message.type) {
        case 'thought':
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'start':
          setRunning(true);
          break;
        case 'finish':
          setRunning(false);
          setAiProcessing(false);
          setThought({ subject: '', description: '' });
          break;
        case 'content':
          // Clear thought when final answer arrives
          setThought({ subject: '', description: '' });
          addOrUpdateMessage(transformedMessage);
          break;
        case 'agent_status': {
          // Update ACP/Agent status
          const agentData = message.data as {
            status?: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error';
            backend?: string;
          };
          if (agentData?.status) {
            setAcpStatus(agentData.status);
            // Reset running state when authentication is complete
            if (['authenticated', 'session_active'].includes(agentData.status)) {
              setRunning(false);
            }
          }
          addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'user_content':
          addOrUpdateMessage(transformedMessage);
          break;
        case 'acp_permission':
          addOrUpdateMessage(transformedMessage);
          break;
        case 'error':
          // Stop AI processing state when error occurs
          setAiProcessing(false);
          addOrUpdateMessage(transformedMessage);
          break;
        case 'ingest_progress': {
          const progress = message.data as typeof ingestionProgress;
          if (progress?.status === 'complete') {
            setIngestionProgress(progress);
            setTimeout(() => setIngestionProgress(null), 1500);
          } else {
            setIngestionProgress(progress);
          }
          break;
        }
        default:
          addOrUpdateMessage(transformedMessage);
          break;
      }
    },
    [conversation_id, addOrUpdateMessage, throttledSetThought, setThought, setRunning, setAiProcessing, setAcpStatus]
  );

  useEffect(() => {
    return ipcBridge.acpConversation.responseStream.on(handleResponseMessage);
  }, [handleResponseMessage]);

  // Reset state when conversation changes
  useEffect(() => {
    setRunning(false);
    setThought({ subject: '', description: '' });
    setAcpStatus(null);
    setAiProcessing(false);
    setIngestionProgress(null);
  }, [conversation_id]);

  const resetState = useCallback(() => {
    setRunning(false);
    setAiProcessing(false);
    setThought({ subject: '', description: '' });
  }, []);

  return { thought, setThought, running, acpStatus, aiProcessing, setAiProcessing, ingestionProgress, resetState };
};

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useAcpSendBoxDraft(conversation_id);
  const atPath = data?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = data?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = data?.content ?? '';

  const setAtPath = useCallback(
    (atPath: Array<string | FileOrFolderItem>) => {
      mutate((prev) => ({ ...prev, atPath }));
    },
    [data, mutate]
  );

  const setUploadFile = createSetUploadFile(mutate, data);

  const setContent = useCallback(
    (content: string) => {
      mutate((prev) => ({ ...prev, content }));
    },
    [data, mutate]
  );

  return {
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
    content,
    setContent,
  };
};

const AcpSendBox: React.FC<{
  conversation_id: string;
  backend: AcpBackend;
}> = ({ conversation_id, backend }) => {
  const { thought, running, acpStatus, aiProcessing, setAiProcessing, ingestionProgress, resetState } = useAcpMessage(conversation_id);
  const { checkAndUpdateTitle } = useAutoTitle();
  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
  const { setSendBoxHandler } = usePreviewContext();

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

  const sendingInitialMessageRef = useRef(false); // Prevent duplicate sends
  const addOrUpdateMessage = useAddOrUpdateMessage(); // Move this here so it's available in useEffect
  const addOrUpdateMessageRef = useLatestRef(addOrUpdateMessage);

  // Use shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });

  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      // If there's existing content, add newline and new text; otherwise just set the text
      const newContent = content ? `${content}\n${text}` : text;
      setContentRef.current(newContent);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  // Listen for sendbox.fill event to populate input from external sources
  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      setContentRef.current(text);
    },
    []
  );

  // Check for and send initial message from guid page when ACP is authenticated
  useEffect(() => {
    if (!acpStatus) {
      return;
    }
    if (acpStatus !== 'session_active') {
      return;
    }

    const sendInitialMessage = async () => {
      // Check flag at the actual execution time
      if (sendingInitialMessageRef.current) {
        return;
      }
      sendingInitialMessageRef.current = true;
      const storageKey = `acp_initial_message_${conversation_id}`;
      const storedMessage = sessionStorage.getItem(storageKey);

      if (!storedMessage) {
        return;
      }
      try {
        const initialMessage = JSON.parse(storedMessage);
        const { input, files } = initialMessage;
        // ACP: Do not use buildDisplayMessage, pass raw input directly
        // File references are added by backend ACP agent (using copied actual paths)
        // Avoid inconsistent file references in messages
        const msg_id = uuid();

        // Start AI processing loading state (user message will be added via backend response)
        setAiProcessing(true);

        // Send the message
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input,
          msg_id,
          conversation_id,
          files,
        });

        if (result && result.success === true) {
          // Initial message sent successfully
          void checkAndUpdateTitle(conversation_id, input);
          // Wait a short time to ensure backend database update is complete
          await new Promise((resolve) => setTimeout(resolve, 100));
          sessionStorage.removeItem(storageKey);
          emitter.emit('chat.history.refresh');
        } else {
          // Handle send failure
          log.error({ err: result }, '[ACP-FRONTEND] Failed to send initial message:');
          // Create error message in UI
          const errorMessage: TMessage = {
            id: uuid(),
            msg_id: uuid(),
            conversation_id,
            type: 'tips',
            position: 'center',
            content: {
              content: 'Failed to send message. Please try again.',
              type: 'error',
            },
            createdAt: Date.now() + 2,
          };
          addOrUpdateMessageRef.current(errorMessage, true);
          sendingInitialMessageRef.current = false; // Reset flag on failure
          setAiProcessing(false); // Stop loading state on failure
        }
      } catch (error) {
        log.error({ err: error }, 'Error sending initial message:');
        sessionStorage.removeItem(storageKey);
        sendingInitialMessageRef.current = false; // Reset flag on error
        setAiProcessing(false); // Stop loading state on error
      }
    };

    sendInitialMessage().catch((error) => {
      log.error({ err: error }, 'Failed to send initial message:');
    });
  }, [conversation_id, backend, acpStatus]);

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();

    // ACP: Do not use buildDisplayMessage, pass raw input directly
    // File references are added by backend ACP agent (using copied actual paths)
    // Avoid inconsistent file references in messages causing Claude to read wrong files

    // Merge uploadFile and atPath (workspace selected files)
    const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path));
    const allFiles = [...uploadFile, ...atPathFiles];

    // Clear input immediately to avoid user thinking message wasn't sent
    setContent('');
    clearFiles();

    // Start AI processing loading state
    setAiProcessing(true);

    // Send message via ACP
    try {
      await ipcBridge.acpConversation.sendMessage.invoke({
        input: message,
        msg_id,
        conversation_id,
        files: allFiles,
      });
      void checkAndUpdateTitle(conversation_id, message);
      emitter.emit('chat.history.refresh');
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Check if it's an ACP authentication error
      const isAuthError = errorMsg.includes('[ACP-AUTH-') || errorMsg.includes('authentication failed') || errorMsg.includes('认证失败');

      if (isAuthError) {
        // Create error message in conversation instead of alert
        const errorMessage = {
          id: uuid(),
          msg_id: uuid(),
          conversation_id,
          type: 'error',
          data: `${backend} authentication failed:\n\n${errorMsg}\n\nPlease check your local CLI tool authentication status`,
        };

        // Add error message to conversation
        ipcBridge.acpConversation.responseStream.emit(errorMessage);

        // Stop loading state since AI won't respond
        setAiProcessing(false);
        return; // Don't re-throw error, just show the message
      }
      // Stop loading state for other errors too
      setAiProcessing(false);
      throw error;
    }

    // Clear selected files (similar to GeminiSendBox)
    emitter.emit('acp.selected.file.clear');
    if (allFiles.length) {
      emitter.emit('acp.workspace.refresh');
    }
  };

  useAddEventListener('acp.selected.file', setAtPath);
  useAddEventListener('acp.selected.file.append', (items: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, items);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  // Stop conversation handler
  const handleStop = async (): Promise<void> => {
    // Use finally to ensure UI state is reset even if backend stop fails
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      resetState();
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <ThoughtDisplay thought={thought} running={running || aiProcessing} onStop={handleStop} />

      {ingestionProgress && (
        <div className='px-3 py-2 flex items-center gap-2 text-sm' style={{ color: 'var(--color-text-2)' }}>
          <Progress percent={ingestionProgress.status === 'complete' ? 100 : ingestionProgress.status === 'stage' && ingestionProgress.percent ? ingestionProgress.percent : Math.round(((ingestionProgress.current || 0) / Math.max(ingestionProgress.total, 1)) * 100)} status={ingestionProgress.status === 'error' ? 'error' : 'normal'} size='small' style={{ flex: 1 }} />
          <span className='whitespace-nowrap text-xs'>
            {ingestionProgress.status === 'start' && `Preparing to index ${ingestionProgress.total} file(s)...`}
            {ingestionProgress.status === 'stage' && ingestionProgress.stage === 'extracting' && `📄 Extracting text from ${ingestionProgress.fileName || 'document'}...`}
            {ingestionProgress.status === 'stage' && ingestionProgress.stage === 'setup' && '🔌 Connecting to embedding service...'}
            {ingestionProgress.status === 'stage' && ingestionProgress.stage === 'chunking' && `✂️ ${ingestionProgress.detail || 'Splitting document into chunks...'}`}
            {ingestionProgress.status === 'stage' && ingestionProgress.stage === 'embedding' && `🧠 ${ingestionProgress.detail || 'Generating embeddings...'}`}
            {ingestionProgress.status === 'stage' && ingestionProgress.stage === 'indexing' && `💾 ${ingestionProgress.detail || 'Building search index...'}`}
            {ingestionProgress.status === 'stage' && ingestionProgress.stage === 'complete' && '✅ Indexing complete'}
            {ingestionProgress.status === 'ingesting' && `Processing ${ingestionProgress.fileName}...`}
            {ingestionProgress.status === 'success' && `Added ${ingestionProgress.fileName} to Knowledge Base`}
            {ingestionProgress.status === 'complete' && `✅ Indexed ${ingestionProgress.successCount} file(s)`}
          </span>
        </div>
      )}

      <SendBox
        value={content}
        onChange={setContent}
        loading={running || aiProcessing || ingestionProgress !== null}
        disabled={ingestionProgress !== null}
        placeholder={`Send message to ${backend}...`}
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        tools={
          <Button
            type='secondary'
            shape='circle'
            icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
            onClick={() => {
              void ipcBridge.dialog.showOpen.invoke({ properties: ['openFile', 'multiSelections'] }).then((files) => {
                if (files && files.length > 0) {
                  setUploadFile([...uploadFile, ...files]);
                }
              });
            }}
          />
        }
        prefix={
          <>
            {/* Files on top */}
            {(uploadFile.length > 0 || atPath.some((item) => (typeof item === 'string' ? true : item.isFile))) && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))} />
                ))}
                {atPath.map((item) => {
                  const isFile = typeof item === 'string' ? true : item.isFile;
                  const path = typeof item === 'string' ? item : item.path;
                  if (isFile) {
                    return (
                      <FilePreview
                        key={path}
                        path={path}
                        onRemove={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? v !== path : v.path !== path));
                          emitter.emit('acp.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      />
                    );
                  }
                  return null;
                })}
              </HorizontalFileList>
            )}
            {/* Folder tags below */}
            {atPath.some((item) => (typeof item === 'string' ? false : !item.isFile)) && (
              <div className='flex flex-wrap items-center gap-8px mb-8px'>
                {atPath.map((item) => {
                  if (typeof item === 'string') return null;
                  if (!item.isFile) {
                    return (
                      <Tag
                        key={item.path}
                        color='blue'
                        closable
                        onClose={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? true : v.path !== item.path));
                          emitter.emit('acp.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      >
                        {item.name}
                      </Tag>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </>
        }
        onSend={onSendHandler}
      ></SendBox>
    </div>
  );
};

export default AcpSendBox;
