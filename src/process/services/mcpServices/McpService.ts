/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from "child_process";
import type { IMcpServer } from "../../../common/storage";
import type { AcpBackend } from "../../../types/acpTypes";
import { AionuiMcpAgent } from "./agents/AionuiMcpAgent";
import { ClaudeMcpAgent } from "./agents/ClaudeMcpAgent";
import { CodexMcpAgent } from "./agents/CodexMcpAgent";
import { GeminiMcpAgent } from "./agents/GeminiMcpAgent";
import { IflowMcpAgent } from "./agents/IflowMcpAgent";
import { QwenMcpAgent } from "./agents/QwenMcpAgent";
import type {
	DetectedMcpServer,
	IMcpProtocol,
	McpConnectionTestResult,
	McpSource,
	McpSyncResult,
} from "./McpProtocol";

/**
 * MCP Service - Coordinates MCP (Model Context Protocol) operations across different agents.
 * Architecture: Defines the protocol, with specific implementations handled by individual agent classes.
 *
 * Agent Type Descriptions:
 * - AcpBackend ('claude', 'qwen', 'iflow', 'gemini', 'codex', etc.): Supported ACP backends.
 * - 'aionui': @office-ai/aioncli-core (AionUi’s locally managed Gemini implementation).
 */
export class McpService {
	private agents: Map<McpSource, IMcpProtocol>;
	private isCliAvailable(cliCommand: string): boolean {
		const isWindows = process.platform === "win32";
		const whichCommand = isWindows ? "where" : "which";

		// Keep original behavior: prefer where/which, then fallback on Windows to Get-Command.
		try {
			execSync(`${whichCommand} ${cliCommand}`, {
				encoding: "utf-8",
				stdio: "pipe",
				timeout: 1000,
			});
			return true;
		} catch {
			if (!isWindows) return false;
		}

		if (isWindows) {
			try {
				// PowerShell fallback for shim scripts like *.ps1 (vfox)
				execSync(
					`powershell -NoProfile -NonInteractive -Command "Get-Command -All ${cliCommand} | Select-Object -First 1 | Out-Null"`,
					{
						encoding: "utf-8",
						stdio: "pipe",
						timeout: 1000,
					},
				);
				return true;
			} catch {
				return false;
			}
		}

		return false;
	}

	constructor() {
		this.agents = new Map([
			["claude", new ClaudeMcpAgent()],
			["qwen", new QwenMcpAgent()],
			["iflow", new IflowMcpAgent()],
			["gemini", new GeminiMcpAgent()],
			["aionui", new AionuiMcpAgent()], // AionUi local @office-ai/aioncli-core
			["codex", new CodexMcpAgent()],
		]);
	}

	/**
	 * Get agent instance for a specific backend
	 */
	private getAgent(backend: McpSource): IMcpProtocol | undefined {
		return this.agents.get(backend);
	}

	/**
	 * Get MCP configurations from detected ACP agents (concurrent version)
	 *
	 * Note: This method also performs additional detection for native Gemini CLI's MCP config,
	 * even if it is disabled in ACP configuration (as fork Gemini is used for ACP).
	 */
	async getAgentMcpConfigs(
		agents: Array<{
			backend: AcpBackend;
			name: string;
			cliPath?: string;
		}>,
	): Promise<DetectedMcpServer[]> {
		// Create full detection list, containing ACP agents and additional MCP-only agents
		const allAgentsToCheck = [...agents];

		// Check if native Gemini CLI needs to be added (if not already in ACP agents)
		const hasNativeGemini = agents.some(
			(a) => a.backend === "gemini" && a.cliPath === "gemini",
		);
		if (!hasNativeGemini) {
			// Check if native Gemini CLI is installed in the system
			try {
				if (!this.isCliAvailable("gemini")) {
					throw new Error("gemini not found");
				}

				// If native Gemini CLI found, add to detection list
				allAgentsToCheck.push({
					backend: "gemini" as AcpBackend,
					name: "Google Gemini CLI",
					cliPath: "gemini",
				});
				console.log("[McpService] Added native Gemini CLI for MCP detection");
			} catch {
				// Native Gemini CLI not installed, skip
			}
		}

		// Concurrently execute MCP detection for all agents
		const promises = allAgentsToCheck.map(async (agent) => {
			try {
				// Skip fork Gemini (backend='gemini' and cliPath=undefined)
				// MCP config for fork Gemini should be managed by AionuiMcpAgent
				if (agent.backend === "gemini" && !agent.cliPath) {
					console.log(
						`[McpService] Skipping fork Gemini (ACP only, MCP managed by AionuiMcpAgent)`,
					);
					return null;
				}

				const agentInstance = this.getAgent(agent.backend);
				if (!agentInstance) {
					console.warn(
						`[McpService] No agent instance for backend: ${agent.backend}`,
					);
					return null;
				}

				const servers = await agentInstance.detectMcpServers(agent.cliPath);
				console.log(
					`[McpService] Detected ${servers.length} MCP servers for ${agent.backend} (cliPath: ${agent.cliPath || "default"})`,
				);

				if (servers.length > 0) {
					return {
						source: agent.backend as McpSource,
						servers,
					};
				}
				return null;
			} catch (error) {
				console.warn(
					`[McpService] Failed to detect MCP servers for ${agent.backend}:`,
					error,
				);
				return null;
			}
		});

		const results = await Promise.all(promises);
		return results.filter(
			(result): result is DetectedMcpServer => result !== null,
		);
	}

	/**
	 * Test MCP server connection
	 */
	async testMcpConnection(
		server: IMcpServer,
	): Promise<McpConnectionTestResult> {
		// Use the first available agent for connection testing, as logic in base class is generic
		const firstAgent = this.agents.values().next().value;
		if (firstAgent) {
			return await firstAgent.testMcpConnection(server);
		}
		return {
			success: false,
			error: "No agent available for connection testing",
		};
	}

	/**
	 * Sync MCP configuration to all detected agents
	 */
	async syncMcpToAgents(
		mcpServers: IMcpServer[],
		agents: Array<{
			backend: AcpBackend;
			name: string;
			cliPath?: string;
		}>,
	): Promise<McpSyncResult> {
		// Only sync enabled MCP servers
		const enabledServers = mcpServers.filter((server) => server.enabled);

		if (enabledServers.length === 0) {
			return { success: true, results: [] };
		}

		// Concurrently execute MCP sync for all agents
		const promises = agents.map(async (agent) => {
			try {
				const agentInstance = this.getAgent(agent.backend);
				if (!agentInstance) {
					console.warn(
						`[McpService] Skipping MCP sync for unsupported backend: ${agent.backend}`,
					);
					return {
						agent: agent.name,
						success: true,
					};
				}

				const result = await agentInstance.installMcpServers(enabledServers);
				return {
					agent: agent.name,
					success: result.success,
					error: result.error,
				};
			} catch (error) {
				return {
					agent: agent.name,
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		});

		const results = await Promise.all(promises);

		const allSuccess = results.every((r) => r.success);

		return { success: allSuccess, results };
	}

	/**
	 * Remove MCP configuration from all detected agents
	 */
	async removeMcpFromAgents(
		mcpServerName: string,
		agents: Array<{
			backend: AcpBackend;
			name: string;
			cliPath?: string;
		}>,
	): Promise<McpSyncResult> {
		// Concurrently execute MCP removal for all agents
		const promises = agents.map(async (agent) => {
			try {
				const agentInstance = this.getAgent(agent.backend);
				if (!agentInstance) {
					console.warn(
						`[McpService] Skipping MCP removal for unsupported backend: ${agent.backend}`,
					);
					return {
						agent: `${agent.backend}:${agent.name}`,
						success: true,
					};
				}

				const result = await agentInstance.removeMcpServer(mcpServerName);
				return {
					agent: `${agent.backend}:${agent.name}`,
					success: result.success,
					error: result.error,
				};
			} catch (error) {
				return {
					agent: `${agent.backend}:${agent.name}`,
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		});

		const results = await Promise.all(promises);

		return { success: true, results };
	}
}

export const mcpService = new McpService();
