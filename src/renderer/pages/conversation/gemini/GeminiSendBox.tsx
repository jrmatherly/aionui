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
import { createLogger } from '@/renderer/utils/logger';
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/messageFiles';
import { getModelContextLimit } from '@/renderer/utils/modelContextLimits';
import { Button, Message, Progress, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeminiModelSelection } from './useGeminiModelSelection';

const log = createLogger('GeminiSendBox');

const useGeminiSendBoxDraft = getSendBoxDraftHook('gemini', {
  _type: 'gemini',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useGeminiMessage = (conversation_id: string, onError?: (message: IResponseMessage) => void) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [streamRunning, setStreamRunning] = useState(false); // API 流是否在运行
  const [hasActiveTools, setHasActiveTools] = useState(false); // 是否有工具在执行或等待确认
  const [waitingResponse, setWaitingResponse] = useState(false); // 等待后端响应（发送消息后到收到 start 之前）
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  // Pending KB notification — stored on kb_ready, emitted as chat message on stream finish
  const pendingKbNotification = useRef<{ msgId: string; content: string } | null>(null);
  const [ingestionProgress, setIngestionProgress] = useState<{
    status: 'start' | 'ingesting' | 'success' | 'error' | 'complete' | 'stage' | 'kb_ready';
    current?: number;
    total: number;
    fileName?: string;
    successCount?: number;
    failedCount?: number;
    stage?: string;
    detail?: string;
    percent?: number;
  } | null>(null);
  // 当前活跃的消息 ID，用于过滤旧请求的事件（防止 abort 后的事件干扰新请求）
  // Current active message ID to filter out events from old requests (prevents aborted request events from interfering with new ones)
  const activeMsgIdRef = useRef<string | null>(null);

  // Use refs to avoid useEffect re-subscription when these states change
  // 使用 ref 避免状态变化时 useEffect 重新订阅导致事件丢失
  const hasActiveToolsRef = useRef(hasActiveTools);
  const streamRunningRef = useRef(streamRunning);
  useEffect(() => {
    hasActiveToolsRef.current = hasActiveTools;
  }, [hasActiveTools]);
  useEffect(() => {
    streamRunningRef.current = streamRunning;
  }, [streamRunning]);

  // Think 消息节流：限制更新频率，减少渲染次数
  // Throttle thought updates to reduce render frequency
  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50; // 50ms 节流间隔
    return (data: ThoughtData) => {
      const now = Date.now();
      const ref = thoughtThrottleRef.current;

      // 如果距离上次更新超过节流间隔，立即更新
      if (now - ref.lastUpdate >= THROTTLE_MS) {
        ref.lastUpdate = now;
        ref.pending = null;
        if (ref.timer) {
          clearTimeout(ref.timer);
          ref.timer = null;
        }
        setThought(data);
      } else {
        // 否则保存最新数据，等待下次更新
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

  // 清理节流定时器
  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  // 综合运行状态：等待响应 或 流在运行 或 有工具在执行/等待确认
  // Combined running state: waiting for response OR stream is running OR tools are active
  const running = waitingResponse || streamRunning || hasActiveTools;

  // 设置当前活跃的消息 ID / Set current active message ID
  const setActiveMsgId = useCallback((msgId: string | null) => {
    activeMsgIdRef.current = msgId;
  }, []);

  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      // 过滤掉不属于当前活跃请求的事件（防止 abort 后的事件干扰）
      // 注意: 只过滤 thought 和 start 等状态消息，其他消息都必须渲染
      // Filter out events not belonging to current active request (prevents aborted events from interfering)
      // Note: only filter out thought and start messages, other messages must be rendered
      if (activeMsgIdRef.current && message.msg_id && message.msg_id !== activeMsgIdRef.current) {
        // 只过滤掉 thought 和 start，其他消息都需要渲染
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
          setWaitingResponse(false); // 收到 start，可以清除等待状态
          break;
        case 'finish':
          {
            setStreamRunning(false);
            // Only clear waiting state and thought when no active tools
            if (!hasActiveToolsRef.current) {
              setWaitingResponse(false);
              setThought({ subject: '', description: '' });
            }
            // Display pending KB notification AFTER agent response completes
            if (pendingKbNotification.current && !hasActiveToolsRef.current) {
              const pending = pendingKbNotification.current;
              pendingKbNotification.current = null;
              const kbMsg = transformMessage({
                type: 'content',
                conversation_id,
                msg_id: pending.msgId,
                data: pending.content,
              });
              addOrUpdateMessage(kbMsg);
            }
          }
          break;
        case 'tool_group':
          {
            // 检查是否有工具在执行或等待确认
            // Check if any tools are executing or awaiting confirmation
            const tools = message.data as Array<{ status: string; name?: string }>;
            const activeStatuses = ['Executing', 'Confirming', 'Pending'];
            const hasActive = tools.some((tool) => activeStatuses.includes(tool.status));
            const wasActive = hasActiveToolsRef.current;
            setHasActiveTools(hasActive);

            // 当工具从活跃变为非活跃时，设置 waitingResponse=true
            // 因为后端还需要继续向模型发送请求
            // When tools transition from active to inactive, set waitingResponse=true
            // because backend needs to continue sending requests to model
            if (wasActive && !hasActive && tools.length > 0) {
              setWaitingResponse(true);
            }

            // 如果有工具在等待确认，更新 thought 提示
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
              // 所有工具完成且流已停止，清除 thought
              // All tools completed and stream stopped, clear thought
              setThought({ subject: '', description: '' });
            }

            // 继续传递消息给消息列表更新
            // Continue passing message to message list update
            addOrUpdateMessage(transformMessage(message));
          }
          break;
        case 'finished':
          {
            // 处理 Finished 事件，提取 token 使用统计
            // Note: 'finished' event is for token usage stats only, NOT for stream end
            // Stream end is signaled by 'finish' event
            // 注意：'finished' 事件仅用于 token 统计，不表示流结束
            // 流结束由 'finish' 事件表示
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
              // 持久化 token 使用统计到会话的 extra.lastTokenUsage 字段
              // 使用 mergeExtra 选项，后端会自动合并 extra 字段，避免两次 IPC 调用
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
            // 不要在这里重置 streamRunning/waitingResponse！
            // 对于 OpenAI 兼容 API，每个流块都会发送 'finished' 事件
            // 只有 'finish' 事件才应该重置流状态
          }
          break;
        case 'ingest_progress': {
          const progress = message.data as typeof ingestionProgress & { fileNames?: string[]; kbMsgId?: string; kbContent?: string };
          if (progress?.status === 'kb_ready') {
            pendingKbNotification.current = {
              msgId: progress.kbMsgId || uuid(),
              content: progress.kbContent || '',
            };
          } else if (progress?.status === 'complete') {
            setIngestionProgress(progress);
            setTimeout(() => setIngestionProgress(null), 1500);
          } else {
            setIngestionProgress(progress);
          }
          break;
        }
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
    // 注意：hasActiveTools 和 streamRunning 通过 ref 访问，避免重新订阅导致事件丢失
  }, [conversation_id, addOrUpdateMessage, onError]);

  useEffect(() => {
    setStreamRunning(false);
    setHasActiveTools(false);
    setWaitingResponse(false);
    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    setIngestionProgress(null);
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res) return;
      if (res.status === 'running') {
        setStreamRunning(true);
      }
      // 加载持久化的 token 使用统计
      if (res.type === 'gemini' && res.extra?.lastTokenUsage) {
        const { lastTokenUsage } = res.extra;
        // 只有当 lastTokenUsage 有有效数据时才设置
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

  return { thought, setThought, running, tokenUsage, ingestionProgress, setActiveMsgId, setWaitingResponse, resetState };
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
        Message.warning('Model quota reached. Please switch to another available model.');
        return;
      }

      void handleSelectModel(fallbackTarget.provider, fallbackTarget.model).then(() => {
        Message.success(`Switched to ${fallbackTarget.model}.`);
      });
    },
    [currentModel, handleSelectModel, isQuotaErrorMessage, resolveFallbackTarget]
  );

  const { thought, running, tokenUsage, ingestionProgress, setActiveMsgId, setWaitingResponse, resetState } = useGeminiMessage(conversation_id, handleGeminiError);

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
        setWaitingResponse(true); // 立即设置等待状态，确保按钮显示为停止

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
        log.error({ err: error }, 'Failed to send initial message:');
      }
    };

    void sendInitialMessage();
  }, [conversation_id, currentModel?.useModel]);

  // 使用 useLatestRef 保存最新的 setContent/atPath，避免重复注册 handler
  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

  // 注册预览面板添加到发送框的 handler
  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      // 如果已有内容，添加换行和新文本；否则直接设置文本
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

  // 使用共享的文件处理逻辑
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });

  const onSendHandler = async (message: string) => {
    if (!currentModel?.useModel) return;
    const msg_id = uuid();
    // 设置当前活跃的消息 ID，用于过滤掉旧请求的事件
    // Set current active message ID to filter out events from old requests
    setActiveMsgId(msg_id);
    setWaitingResponse(true); // 立即设置等待状态，确保按钮显示为停止

    // 保存文件列表（清空前需要保存）/ Save file list before clearing
    const filesToSend = collectSelectedFiles(uploadFile, atPath);
    const hasFiles = filesToSend.length > 0;

    // 立即清空输入框，避免用户误以为消息没发送
    // Clear input immediately to avoid user thinking message wasn't sent
    setContent('');
    clearFiles();

    // User message: Display in UI immediately (Backend will persist when receiving from IPC)
    // 显示原始消息，并附带选中文件名 / Display original message with selected file names
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
    // 文件通过 files 参数传递给后端，不再在消息中添加 @ 前缀
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

  // 停止会话处理函数 Stop conversation handler
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
        loading={running || ingestionProgress !== null}
        disabled={!currentModel?.useModel || ingestionProgress !== null}
        // 占位提示同步右上角选择的模型，确保用户感知当前目标
        // Keep placeholder in sync with header selection so users know the active target
        placeholder={currentModel?.useModel ? `Send message to ${getDisplayModelName(currentModel.useModel)}` : 'No model selected for current session, cannot send message'}
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
