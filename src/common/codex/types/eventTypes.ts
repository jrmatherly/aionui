/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Codex Agent Event Types
export enum CodexAgentEventType {
  // Session and configuration events
  /**
   * Session configured event - confirms client configuration message
   * prompt: 'hello codex'
   * payload: {
   *  session_id: string,
   *  model: string,
   *  reasoning_effort: string | null,
   *  history_log_id: number,
   *  history_entry_count: number,
   *  initial_messages: EventMsg[] | null,
   *  rollout_path: string
   * }
   * */
  SESSION_CONFIGURED = 'session_configured',

  /**
   * Task started event - agent has started the task
   * prompt: 'hello codex'
   * payload: { model_context_window: number | null }
   */
  TASK_STARTED = 'task_started',

  /**
   * Task complete event - agent has completed all operations
   * prompt: 'hello codex'
   * payload: { last_agent_message: string | null }
   */
  TASK_COMPLETE = 'task_complete',

  // Text & reasoning events
  /**
   * Agent message delta event - incremental message from agent text output (streaming incremental message)
   * prompt: 'hello codex'
   * payload: { delta: string }
   */
  AGENT_MESSAGE_DELTA = 'agent_message_delta',

  /**
   * Agent message event - agent text output message (complete output message)
   * prompt: 'hello codex'
   * payload: { message: string }
   */
  AGENT_MESSAGE = 'agent_message',

  /**
   * User message event - user/system input message (content sent to model)
   * prompt: 'hello codex'
   * payload: { message: string, kind: InputMessageKind | null, images: string[] | null }
   */
  USER_MESSAGE = 'user_message',

  /**
   * Agent reasoning event - reasoning event from agent (complete thinking text)
   * prompt: 'Where can I find the interface documentation for codex message formats?'
   * payload: { text: string }
   */
  AGENT_REASONING = 'agent_reasoning',

  /**
   * Agent reasoning delta event - incremental reasoning event from agent (streaming incremental output text)
   * prompt: 'Can you give me an official OpenAI URL?'
   * payload: { delta: string }
   */
  AGENT_REASONING_DELTA = 'agent_reasoning_delta',

  /**
   * Agent reasoning raw content event - raw chain of thought from agent
   * prompt: 'TypeScript compile error: Property X does not exist, please help me analyze the cause'
   * payload: { text: string }
   */
  AGENT_REASONING_RAW_CONTENT = 'agent_reasoning_raw_content',

  /**
   * Agent reasoning raw content delta event - incremental reasoning content event from agent
   * payload: { delta: string }
   */
  AGENT_REASONING_RAW_CONTENT_DELTA = 'agent_reasoning_raw_content_delta',

  /**
   * Agent reasoning section break event - signals when model starts a new reasoning summary section (e.g., new heading block)
   * prompt: 'TypeScript compile error: Property X does not exist, please help me analyze the cause'
   * payload: {}
   */
  AGENT_REASONING_SECTION_BREAK = 'agent_reasoning_section_break',

  // Usage / telemetry
  /**
   * Token count event - usage update for current session, including total and last
   * prompt: 'hello codex'
   * payload: { info: {
      "total_token_usage": {
        "input_tokens": 2439,
        "cached_input_tokens": 2048,
        "output_tokens": 18,
        "reasoning_output_tokens": 0,
        "total_tokens": 2457
      },
      "last_token_usage": {
        "input_tokens": 2439,
        "cached_input_tokens": 2048,
        "output_tokens": 18,
        "reasoning_output_tokens": 0,
        "total_tokens": 2457
      },
      "model_context_window": 272000
    } | null }
   */
  TOKEN_COUNT = 'token_count',

  // Command execution events
  /**
   * Exec command begin event - notifies server that command execution is about to start
   * prompt: 'TypeScript compile error: Property X does not exist, please help me analyze the cause'
   * payload: {
      "type": "exec_command_begin",
      "call_id": "call_vufa8VWQV91WSWcc5BlFTsmQ",
      "command": [ "bash", "-lc", "ls -a" ],
      "cwd": "/Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1758954404275",
      "parsed_cmd": [
        {
        "type": "list_files",
        "cmd": "ls -a",
        "path": null
        }
      ]
    }
   */
  EXEC_COMMAND_BEGIN = 'exec_command_begin',

  /**
   * Exec command output delta event - incremental output chunk from running command
   * prompt: 'TypeScript compile error: Property X does not exist, please help me analyze the cause'
   * payload: { call_id: string, stream: ExecOutputStream, chunk: number[] }
   * {
      "type": "exec_command_output_delta",
      "call_id": "call_vufa8VWQV91WSWcc5BlFTsmQ",
      "stream": "stdout",
      "chunk": "LgouLgo="
    }
   */
  EXEC_COMMAND_OUTPUT_DELTA = 'exec_command_output_delta',

  /**
   * Exec command end event - indicates command execution has completed
   * prompt: 'TypeScript compile error: Property X does not exist, please help me analyze the cause'
   * payload: {
   *  "type": "exec_command_end",
   *  "call_id": "call_vufa8VWQV91WSWcc5BlFTsmQ",
   *  "stdout": ".\\n..\\n",
   *  "stderr": "",
   *  "aggregated_output": ".\\n..\\n",
   *  "exit_code": 0,
   *  "duration": {
   *    "secs": 0,
   *    "nanos": 297701750
   *  },
   *  "formatted_output": ".\\n..\\n"
   * }
   */
  EXEC_COMMAND_END = 'exec_command_end',

  /**
   * Exec approval request event - requests approval for command execution
   * prompt: Create a file hello.txt with content 'hello codex'
   * payload:  {
      "type": "exec_approval_request",
      "call_id": "call_W5qxMSKOP2eHaEq16QCtrhVS",
      "command": ["bash", "-lc", "echo '1231231' > hello.txt" ],
      "cwd": "/Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1758954404275",
      "reason": "Need to create hello.txt with requested content per user instruction"
    }
   */
  EXEC_APPROVAL_REQUEST = 'exec_approval_request',

  // Patch/file modification events
  /**
   * Apply patch approval request event - requests approval for applying code patch
   * prompt: Create a file hello.txt with content 'hello codex'
   * payload: {
      type: 'apply_patch_approval_request',
      call_id: 'patch-7',
      changes: {
        'src/app.ts': { type: 'update', unified_diff: '--- a\n+++ b\n+console.log("hi")\n', move_path: null },
        'README.md': { type: 'add', content: '# Readme\n' },
      },
      reason: null,
      grant_root: null,
    }
   */
  APPLY_PATCH_APPROVAL_REQUEST = 'apply_patch_approval_request',

  /**
   * Patch apply begin event - notifies agent that code patch is about to be applied. Mirrors `ExecCommandBegin` so frontend can show progress indicator
   * tips: When codex runs in sandbox_mode=read-only mode, it cannot write files directly and won't trigger patch_apply_begin -> patch_apply_end flow.
   *      Need to modify config in ~/.codex/config.toml, set sandbox_mode = "workspace-write" apply_patch = true
   * prompt: Write a file using command apply_patch <<'PATCH' ... PATCH, content and filename are up to you
   * payload: {
      "type": "patch_apply_begin",
          "call_id": "call_3tChlyDszdHuQRQTWnuZ8Jvb",
          "auto_approved": false,
          "changes": {
            "/Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1759144414815/note.txt": {
            "add": {
              "content": "This file was created via apply_patch.\nValue: 100.\n"
            }
          }
        }
      }
   */
  PATCH_APPLY_BEGIN = 'patch_apply_begin',

  /**
   * Patch apply end event - notifies that patch application has completed
   * prompt: Write a file using command apply_patch <<'PATCH' ... PATCH, content and filename are up to you
   * payload: {
      "type": "patch_apply_end",
      "call_id": "call_3tChlyDszdHuQRQTWnuZ8Jvb",
      "stdout": "Success. Updated the following files:\nA note.txt\n",
      "stderr": "",
      "success": true
    }
   */
  PATCH_APPLY_END = 'patch_apply_end',

  // MCP tool events
  /**
   * MCP tool call begin event - indicates MCP tool call has started
   * tips: Need to first install codex mcp add 12306-mcp, 12306-mcp is an MCP server, more MCPs can be found at https://modelscope.cn/mcp?page=1, after installation check with codex mcp list
   * prompt: Help me query high-speed rail tickets from Shenzhen to Guangzhou on 2025-10-10
   * payload: {
      "type": "mcp_tool_call_begin",
      "call_id": "call_2ZBKJbPYIBgm5qo2mzRpqi1U",
        "invocation": {
        "server": "12306-mcp",
        "tool": "get-tickets",
        "arguments": {
          "date": "2025-10-10",
          "fromStation": "SZQ",
          "toStation": "GZQ"
        }
      }
    }
   */
  MCP_TOOL_CALL_BEGIN = 'mcp_tool_call_begin',

  /**
   * MCP tool call end event - indicates MCP tool call has ended
   *
   * prompt: Help me query high-speed rail tickets from Shenzhen to Guangzhou on 2025-10-10
   * payload: {
    "type": "mcp_tool_call_end",
      "call_id": "call_VNRuLW1UoklIAK3QTL5iE47l",
      "invocation": {
        "server": "12306-mcp",
        "tool": "get-tickets",
        "arguments": {
          "date": "2025-10-10",
          "fromStation": "SZQ",
          "toStation": "GZQ"
          }
        },
        "duration": {
          "secs": 0,
          "nanos": 874102541
        },
        "result": {
          "Ok": {
          "content": [
            {
            "text": "Train|Departure -> Arrival|Departure Time -> Arrival Time|Duration\nG834 Shenzhen North(telecode:IOQ) -> Guangzhou South(telecode:IZQ) 06:10 -> 06:46 Duration: 00:36\n-...",
            "type": "text"
            }
          ]
        }
      }
    }
   */
  MCP_TOOL_CALL_END = 'mcp_tool_call_end',

  /**
   * MCP list tools response event - list of MCP tools available to the agent
   * payload: { tools: Record<string, McpTool> }
   */
  MCP_LIST_TOOLS_RESPONSE = 'mcp_list_tools_response',

  // Web search events
  /**
   * Web search begin event - indicates web search has started
   * tips: web_search capability needs to be manually enabled, add web_search = true in ~/.codex/config.toml
   * prompt: Find new features in TypeScript 5.0, don't use existing knowledge base, search official site for latest info
   * payload: {
   *  "type":"web_search_begin",
   *  "call_id":"ws_010bdd5c4db8ef410168da04c74a648196b7e30cb864885b26"
   * }
   */
  WEB_SEARCH_BEGIN = 'web_search_begin',

  /**
   * Web search end event - indicates web search has ended
   * prompt: Find new features in TypeScript 5.0, don't use existing knowledge base, search official site for latest info
   * payload: {
   *  "type":"web_search_end",
   *  "call_id":"ws_010bdd5c4db8ef410168da04c74a648196b7e30cb864885b26",
   *  "query":"TypeScript 5.0 whats new site:devblogs.microsoft.com/typescript"
   * }
   */
  WEB_SEARCH_END = 'web_search_end',

  // Conversation history & context
  /**
   * Turn diff event - indicates diff between turns
   * prompt: Write a file using command apply_patch <<'PATCH' ... PATCH, content and filename are up to you
   * payload: {
      "type": "turn_diff",
      // eslint-disable-next-line max-len
      "unified_diff": "diff --git a//Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1759197123355/freestyle.txt b//Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1759197123355/freestyle.txt\nnew file mode 100644\nindex 0000000000000000000000000000000000000000..151e31d7a6627e3fb0df2e49b3c0c179f96e46cc\n--- /dev/null\n+++ b//Users/pojian/Library/Application Support/AionUi/aionui/codex-temp-1759197123355/freestyle.txt\n@@ -0,0 +1,2 @@\n+This file was created via apply_patch.\n+Line two says hello.\n"
    }
   */
  TURN_DIFF = 'turn_diff',

  /**
   * Get history entry response event - response to GetHistoryEntryRequest
   * prompt: View current session history
   * payload: { offset: number, log_id: number, entry: HistoryEntry | null }
   */
  GET_HISTORY_ENTRY_RESPONSE = 'get_history_entry_response',

  /**
   * List custom prompts response event - list of custom prompts available to the agent
   * payload: { custom_prompts: CustomPrompt[] }
   */
  LIST_CUSTOM_PROMPTS_RESPONSE = 'list_custom_prompts_response',

  /**
   * Conversation path event - indicates conversation path information
   * payload: { conversation_id: string, path: string }
   */
  CONVERSATION_PATH = 'conversation_path',

  /**
   * Background event - background processing event
   * payload: { message: string }
   */
  BACKGROUND_EVENT = 'background_event',

  /**
   * Turn aborted event - indicates turn has been aborted
   * payload: { reason: TurnAbortReason }
   */
  TURN_ABORTED = 'turn_aborted',
}
