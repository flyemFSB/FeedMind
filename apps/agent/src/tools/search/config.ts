export type SearchConfig = {
  braveApiKey?: string;
  tavilyApiKey?: string;
  exaApiKey?: string;
};

export class SearchConfigClient {
  private config: SearchConfig | null = null;
  static instance: SearchConfigClient;

  constructor(private backendApiUrl: string) {
    SearchConfigClient.instance = this;
  }

  async load(signal?: AbortSignal): Promise<SearchConfig> {
    if (this.config) return this.config;

    const url = `${this.backendApiUrl.replace(/\/$/, "")}/api/v1/search/config`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Failed to load search config: ${response.status}`);
    }
    const payload = (await response.json()) as { data?: SearchConfig };
    this.config = payload.data ?? {};
    return this.config;
  }

  get(): SearchConfig {
    return this.config ?? {};
  }
}
