/**
 * 工具配置客户端 — 从后端 API 加载工具配置。
 * 使用 /tools/runtime 端点，password 字段自动解密返回真实值。
 */

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
  static instance: ToolConfigClient;

  constructor(private backendApiUrl: string) {
    ToolConfigClient.instance = this;
  }

  async load(signal?: AbortSignal): Promise<ToolEntry[]> {
    // 使用 /tools/runtime 端点，返回解密后的 password 字段
    const url = `${this.backendApiUrl.replace(/\/$/, "")}/api/v1/tools/runtime`;
    const response = await fetch(url, { signal });

    if (response.status === 404) {
      this.tools = [];
      return this.tools;
    }
    if (!response.ok) {
      throw new Error(`Failed to load tools runtime config: ${response.status}`);
    }

    const payload = (await response.json()) as { data?: ToolEntry[] };
    this.tools = payload.data ?? [];
    return this.tools;
  }

  get(): ToolEntry[] {
    return this.tools ?? [];
  }

  getTool(name: string): ToolEntry | undefined {
    return (this.tools ?? []).find((t) => t.name === name);
  }
}
