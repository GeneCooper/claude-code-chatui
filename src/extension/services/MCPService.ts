import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { MCPServerConfig, MCPConfig } from '../../shared/types';

/**
 * Manages MCP (Model Context Protocol) server configurations.
 * Config stored at {globalStorageUri}/mcp/mcp-servers.json.
 */
export class MCPService {
  private _configDir: string;
  private _configPath: string;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._configDir = path.join(_context.globalStorageUri.fsPath, 'mcp');
    this._configPath = path.join(this._configDir, 'mcp-servers.json');
    this._ensureConfigDir();
  }

  get configPath(): string {
    return this._configPath;
  }

  private _ensureConfigDir(): void {
    if (!fs.existsSync(this._configDir)) {
      fs.mkdirSync(this._configDir, { recursive: true });
    }
    if (!fs.existsSync(this._configPath)) {
      fs.writeFileSync(this._configPath, JSON.stringify({ mcpServers: {} }, null, 2), 'utf8');
    }
  }

  /**
   * Load all MCP server configurations.
   */
  loadServers(): Record<string, MCPServerConfig> {
    try {
      const raw = fs.readFileSync(this._configPath, 'utf8');
      const config = JSON.parse(raw) as MCPConfig;
      return config.mcpServers || {};
    } catch {
      return {};
    }
  }

  /**
   * Save or update an MCP server configuration.
   */
  saveServer(name: string, config: MCPServerConfig): void {
    const allConfig = this._loadConfig();
    allConfig.mcpServers[name] = config;
    this._writeConfig(allConfig);
  }

  /**
   * Delete an MCP server configuration.
   */
  deleteServer(name: string): boolean {
    const allConfig = this._loadConfig();
    if (!(name in allConfig.mcpServers)) return false;
    delete allConfig.mcpServers[name];
    this._writeConfig(allConfig);
    return true;
  }

  private _loadConfig(): MCPConfig {
    try {
      const raw = fs.readFileSync(this._configPath, 'utf8');
      return JSON.parse(raw) as MCPConfig;
    } catch {
      return { mcpServers: {} };
    }
  }

  private _writeConfig(config: MCPConfig): void {
    fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2), 'utf8');
  }
}
