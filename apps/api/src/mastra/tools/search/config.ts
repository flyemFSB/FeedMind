/**
 * 工具配置客户端 — 通过 service 层直接从数据库加载工具配置（同进程内直接调用，不走 HTTP）。
 * password 字段由 listToolsRuntime() 自动解密返回真实值。
 */
import { listToolsRuntime, getToolConfigVersion } from "../../../modules/tools/service.js";

export interface ToolConfig {
  [key: string]: unknown;
}

export interface ToolEntry {
  name: string;
  config: ToolConfig;
  is_enabled: boolean;
}

export class ToolConfigClient {
  private tools: ToolEntry[] | null = null;
  private lastLoaded: number = 0;
  private loadedVersion: number = -1;
  private readonly ttl: number = 60_000; // 缓存有效期 60 秒
  static instance: ToolConfigClient;

  constructor() {
    ToolConfigClient.instance = this;
  }

  /** 获取或懒初始化单例 */
  static getInstance(): ToolConfigClient {
    if (!ToolConfigClient.instance) {
      new ToolConfigClient();
    }
    return ToolConfigClient.instance;
  }

  async load(_signal?: AbortSignal): Promise<ToolEntry[]> {
    const version = getToolConfigVersion();
    // 版本号变化立即失效，不等 TTL：写入方在 modules/tools/service 自增，读取侧无需被通知
    if (this.tools && this.loadedVersion === version && Date.now() - this.lastLoaded < this.ttl) {
      return this.tools;
    }
    const entries = await listToolsRuntime();
    this.tools = entries.map((t) => ({
      name: t.name,
      config: t.config as ToolConfig,
      is_enabled: t.is_enabled,
    }));
    this.lastLoaded = Date.now();
    this.loadedVersion = version;
    return this.tools;
  }

  getTool(name: string): ToolEntry | undefined {
    return (this.tools ?? []).find((t) => t.name === name);
  }
}
