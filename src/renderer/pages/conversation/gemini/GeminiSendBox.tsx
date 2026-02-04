import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { TChatConversation, TokenUsageData } from '@/common/storage';
import { uuid } from '@/common/utils';
import ContextUsageIndicator from '@/renderer/components/ContextUsageIndicator';
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
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/messageFiles';
import { getModelContextLimit } from '@/renderer/utils/modelContextLimits';
import { Button, Message, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GeminiModelSelection } from './useGeminiModelSelection';

const useGeminiSendBoxDraft = getSendBoxDraftHook('gemini', {
  _type: 'gemini',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useGeminiMessage = (conversation_id: string, onError?: (message: IResponseMessage) => void) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [streamRunning, setStreamRunning] = useState(false); // Whether API stream is running
  const [hasActiveTools, setHasActiveTools] = useState(false); // Whether tools are executing or awaiting confirmation
  const [waitingResponse, setWaitingResponse] = useState(false); // Waiting for backend response (after sending message until receiving start)
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  // Current active message ID to filter out events from old requests (prevents aborted request events from interfering with new ones)
  const activeMsgIdRef = useRef<string | null>(null);

  // Use refs to avoid useEffect re-subscription when these states change
  const hasActiveToolsRef = useRef(hasActiveTools);
  const streamRunningRef = useRef(streamRunning);
  useEffect(() => {
    hasActiveToolsRef.current = hasActiveTools;
  }, [hasActiveTools]);
  useEffect(() => {
    streamRunningRef.current = streamRunning;
  }, [streamRunning]);

  // Throttle thought updates to reduce render frequency
  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50; // 50ms throttle interval
    return (data: ThoughtData) => {
      const now = Date.now();
      const ref = thoughtThrottleRef.current;

      // If time since last update exceeds throttle interval, update immediately
      if (now - ref.lastUpdate >= THROTTLE_MS) {
        ref.lastUpdate = now;
        ref.pending = null;
        if (ref.timer) {
          clearTimeout(ref.timer);
          ref.timer = null;
        }
        setThought(data);
      } else {
        // Otherwise save latest data and wait for next update
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

  // Cleanup throttle timer
  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  // Combined running state: waiting for response OR stream is running OR tools are active
  const running = waitingResponse || streamRunning || hasActiveTools;

  // Set current active message ID
  const setActiveMsgId = useCallback((msgId: string | null) => {
    activeMsgIdRef.current = msgId;
  }, []);

  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      // Filter out events not belonging to current active request (prevents aborted events from interfering)
      // Note: only filter out thought and start messages, other messages must be rendered
      if (activeMsgIdRef.current && message.msg_id && message.msg_id !== activeMsgIdRef.current) {
        // Only filter out thought and start, other messages need to be rendered
        if (message.type === 'thought') {
          return;
        }
      }

      switch (message.type) {
        case 'thought':
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'start':
          setStreamRunning(true);
          setWaitingResponse(false); // Received start, can clear waiting state
          break;
        case 'finish':
          {
            setStreamRunning(false);
            // Only clear waiting state and thought when no active tools
            // When tools are active, backend needs to continue sending requests to model after tool completion
            if (!hasActiveToolsRef.current) {
              setWaitingResponse(false);
              setThought({ subject: '', description: '' });
            }
          }
          break;
        case 'tool_group':
          {
            // Check if any tools are executing or awaiting confirmation
            const tools = message.data as Array<{ status: string; name?: string }>;
            const activeStatuses = ['Executing', 'Confirming', 'Pending'];
            const hasActive = tools.some((tool) => activeStatuses.includes(tool.status));
            const wasActive = hasActiveToolsRef.current;
            setHasActiveTools(hasActive);

            // When tools transition from active to inactive, set waitingResponse=true
            // because backend needs to continue sending requests to model
            if (wasActive && !hasActive && tools.length > 0) {
              setWaitingResponse(true);
            }

            // If tools are awaiting confirmation, update thought hint
            const confirmingTool = tools.find((tool) => tool.status === 'Confirming');
            if (confirmingTool) {
              setThought({
                subject: 'Awaiting Confirmation',
                description: confirmingTool.name || 'Tool execution',
              });
            } else if (hasActive) {
              const executingTool = tools.find((tool) => tool.status === 'Executing');
              if (executingTool) {
                setThought({
                  subject: 'Executing',
                  description: executingTool.name || 'Tool',
                });
              }
            } else if (!streamRunningRef.current) {
              // All tools completed and stream stopped, clear thought
              setThought({ subject: '', description: '' });
            }

            // Continue passing message to message list update
            addOrUpdateMessage(transformMessage(message));
          }
          break;
        case 'finished':
          {
            // Handle Finished event, extract token usage statistics
            // Note: 'finished' event is for token usage stats only, NOT for stream end
            // Stream end is signaled by 'finish' event
            const finishedData = message.data as {
              reason?: string;
              usageMetadata?: {
                promptTokenCount?: number;
                candidatesTokenCount?: number;
                totalTokenCount?: number;
                cachedContentTokenCount?: number;
              };
            };
            if (finishedData?.usageMetadata) {
              const newTokenUsage: TokenUsageData = {
                totalTokens: finishedData.usageMetadata.totalTokenCount || 0,
              };
              setTokenUsage(newTokenUsage);
              // Persist token usage stats to conversation's extra.lastTokenUsage field
              // Using mergeExtra option, backend will auto-merge extra field, avoiding two IPC calls
              void ipcBridge.conversation.update.invoke({
                id: conversation_id,
                updates: {
                  extra: {
                    lastTokenUsage: newTokenUsage,
                  } as TChatConversation['extra'],
                },
                mergeExtra: true,
              });
            }
            // DO NOT reset streamRunning/waitingResponse here!
            // For OpenAI-compatible APIs, 'finished' events are emitted per chunk
            // Only 'finish' event should reset the stream state
          }
          break;
        default: {
          if (message.type === 'error') {
            setWaitingResponse(false);
            onError?.(message as IResponseMessage);
          }
          // Backend handles persistence, Frontend only updates UI
          addOrUpdateMessage(transformMessage(message));
          break;
        }
      }
    });
    // Note: hasActiveTools and streamRunning are accessed via refs to avoid re-subscription
  }, [conversation_id, addOrUpdateMessage, onError]);

  useEffect(() => {
    setStreamRunning(false);
    setHasActiveTools(false);
    setWaitingResponse(false);
    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res) return;
      if (res.status === 'running') {
        setStreamRunning(true);
      }
      // Load persisted token usage statistics
      if (res.type === 'gemini' && res.extra?.lastTokenUsage) {
        const { lastTokenUsage } = res.extra;
        // Only set if lastTokenUsage has valid data
        if (lastTokenUsage.totalTokens > 0) {
          setTokenUsage(lastTokenUsage);
        }
      }
    });
  }, [conversation_id]);

  const resetState = useCallback(() => {
    setWaitingResponse(false);
    setStreamRunning(false);
    setHasActiveTools(false);
    setThought({ subject: '', description: '' });
  }, []);

  return { thought, setThought, running, tokenUsage, setActiveMsgId, setWaitingResponse, resetState };
};

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useGeminiSendBoxDraft(conversation_id);

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

const GeminiSendBox: React.FC<{
  conversation_id: string;
  modelSelection: GeminiModelSelection;
}> = ({ conversation_id, modelSelection }) => {
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const quotaPromptedRef = useRef<string | null>(null);
  const exhaustedModelsRef = useRef(new Set<string>());

  const { currentModel, getDisplayModelName, providers, geminiModeLookup, getAvailableModels, handleSelectModel } = modelSelection;

  const resolveFallbackTarget = useCallback(
    (exhaustedModels: Set<string>) => {
      if (!currentModel) return null;
      const provider = providers.find((item) => item.id === currentModel.id) || providers.find((item) => item.platform?.toLowerCase().includes('gemini-with-google-auth'));
      if (!provider) return null;

      const isGoogleAuthProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
      const manualOption = isGoogleAuthProvider ? geminiModeLookup.get('manual') : undefined;
      const manualModels = manualOption?.subModels?.map((model) => model.value) || [];
      const availableModels = isGoogleAuthProvider ? manualModels : getAvailableModels(provider);
      const candidates = availableModels.filter((model) => model && model !== currentModel.useModel && !exhaustedModels.has(model) && model !== 'manual');

      if (!candidates.length) return null;
      const scoreModel = (modelName: string) => {
        const lower = modelName.toLowerCase();
        let score = 0;
        if (lower.includes('lite')) score -= 2;
        if (lower.includes('flash')) score -= 1;
        if (lower.includes('pro')) score += 2;
        return score;
      };
      const sortedCandidates = [...candidates].sort((a, b) => {
        const scoreA = scoreModel(a);
        const scoreB = scoreModel(b);
        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.localeCompare(b);
      });
      return { provider, model: sortedCandidates[0] };
    },
    [currentModel, providers, geminiModeLookup, getAvailableModels]
  );

  const isQuotaErrorMessage = useCallback((data: unknown) => {
    if (typeof data !== 'string') return false;
    const text = data.toLowerCase();
    const hasQuota = text.includes('quota') || text.includes('resource_exhausted') || text.includes('model_capacity_exhausted') || text.includes('no capacity available');
    const hasLimit = text.includes('limit') || text.includes('exceed') || text.includes('exhaust') || text.includes('status: 429') || text.includes('code 429') || text.includes('429') || text.includes('ratelimitexceeded');
    return hasQuota && hasLimit;
  }, []);

  const handleGeminiError = useCallback(
    (message: IResponseMessage) => {
      if (!isQuotaErrorMessage(message.data)) return;
      const msgId = message.msg_id || 'unknown';
      if (quotaPromptedRef.current === msgId) return;
      quotaPromptedRef.current = msgId;

      if (currentModel?.useModel) {
        exhaustedModelsRef.current.add(currentModel.useModel);
      }
      const fallbackTarget = resolveFallbackTarget(exhaustedModelsRef.current);
      if (!fallbackTarget || !currentModel || fallbackTarget.model === currentModel.useModel) {
        Message.warning(t('conversation.chat.quotaExceededNoFallback', { defaultValue: 'Model quota reached. Please switch to another available model.' }));
        return;
      }

      void handleSelectModel(fallbackTarget.provider, fallbackTarget.model).then(() => {
        Message.success(t('conversation.chat.quotaSwitched', { defaultValue: `Switched to ${fallbackTarget.model}.`, model: fallbackTarget.model }));
      });
    },
    [currentModel, handleSelectModel, isQuotaErrorMessage, resolveFallbackTarget, t]
  );

  const { thought, running, tokenUsage, setActiveMsgId, setWaitingResponse, resetState } = useGeminiMessage(conversation_id, handleGeminiError);

  useEffect(() => {
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res?.extra?.workspace) return;
      setWorkspacePath(res.extra.workspace);
    });
  }, [conversation_id]);

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);

  const addOrUpdateMessage = useAddOrUpdateMessage();
  const { setSendBoxHandler } = usePreviewContext();

  // Handle initial message from guid page (stored in sessionStorage for instant page transition)
  useEffect(() => {
    const storageKey = `gemini_initial_message_${conversation_id}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage || !currentModel?.useModel) return;

    // Clear immediately to prevent duplicate sends
    sessionStorage.removeItem(storageKey);

    const sendInitialMessage = async () => {
      try {
        const { input, files } = JSON.parse(storedMessage) as { input: string; files?: string[] };
        const msg_id = uuid();
        setActiveMsgId(msg_id);
        setWaitingResponse(true); // Set waiting state immediately to ensure button shows as stop

        // Display user message immediately
        addOrUpdateMessage(
          {
            id: msg_id,
            type: 'text',
            position: 'right',
            conversation_id,
            content: {
              content: input,
            },
            createdAt: Date.now(),
          },
          true
        );

        // Send message to backend
        await ipcBridge.geminiConversation.sendMessage.invoke({
          input,
          msg_id,
          conversation_id,
          files: files || [],
        });

        void checkAndUpdateTitle(conversation_id, input);
        emitter.emit('chat.history.refresh');
        if (files && files.length > 0) {
          emitter.emit('gemini.workspace.refresh');
        }
      } catch (error) {
        console.error('Failed to send initial message:', error);
      }
    };

    void sendInitialMessage();
  }, [conversation_id, currentModel?.useModel]);

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

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

  // Use shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });

  const onSendHandler = async (message: string) => {
    if (!currentModel?.useModel) return;
    const msg_id = uuid();
    // Set current active message ID to filter out events from old requests
    setActiveMsgId(msg_id);
    setWaitingResponse(true); // Set waiting state immediately to ensure button shows as stop

    // Save file list before clearing
    const filesToSend = collectSelectedFiles(uploadFile, atPath);
    const hasFiles = filesToSend.length > 0;

    // Clear input immediately to avoid user thinking message wasn't sent
    setContent('');
    clearFiles();

    // User message: Display in UI immediately (Backend will persist when receiving from IPC)
    // Display original message with selected file names
    const displayMessage = buildDisplayMessage(message, filesToSend, workspacePath);
    addOrUpdateMessage(
      {
        id: msg_id,
        type: 'text',
        position: 'right',
        conversation_id,
        content: {
          content: displayMessage,
        },
        createdAt: Date.now(),
      },
      true
    );
    // Files are passed via files param, no longer adding @ prefix in message
    await ipcBridge.geminiConversation.sendMessage.invoke({
      input: displayMessage,
      msg_id,
      conversation_id,
      files: filesToSend,
    });
    void checkAndUpdateTitle(conversation_id, message);
    emitter.emit('chat.history.refresh');
    emitter.emit('gemini.selected.file.clear');
    if (hasFiles) {
      emitter.emit('gemini.workspace.refresh');
    }
  };

  useAddEventListener('gemini.selected.file', setAtPath);
  useAddEventListener('gemini.selected.file.append', (items: Array<string | FileOrFolderItem>) => {
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
      <ThoughtDisplay thought={thought} running={running} onStop={handleStop} />

      <SendBox
        value={content}
        onChange={setContent}
        loading={running}
        disabled={!currentModel?.useModel}
        // Keep placeholder in sync with header selection so users know the active target
        placeholder={currentModel?.useModel ? t('conversation.chat.sendMessageTo', { model: getDisplayModelName(currentModel.useModel) }) : t('conversation.chat.noModelSelected')}
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
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
        sendButtonPrefix={<ContextUsageIndicator tokenUsage={tokenUsage} contextLimit={getModelContextLimit(currentModel?.useModel)} size={24} />}
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
                          emitter.emit('gemini.selected.file', newAtPath);
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
                          emitter.emit('gemini.selected.file', newAtPath);
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

export default GeminiSendBox;
