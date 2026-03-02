import dotenv from 'dotenv';
dotenv.config();

export interface ConfluencePage {
  id: string;
  title: string;
  type: string;
  status: string;
  _links: {
    webui: string;
    self: string;
  };
  version?: {
    when: string;
    number: number;
  };
}

export interface ConfluenceSearchResult {
  results: ConfluencePage[];
  start: number;
  limit: number;
  size: number;
  _links: {
    base: string;
  };
}

export class ConfluenceClient {
  private baseUrl: string;
  private auth: string;

  constructor() {
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN;
    const baseUrl = process.env.JIRA_BASE_URL;

    if (!email || !token || !baseUrl) {
      throw new Error(
        'Missing Confluence credentials. Set JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_BASE_URL in .env'
      );
    }

    this.baseUrl = baseUrl;
    this.auth = Buffer.from(`${email}:${token}`).toString('base64');
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/wiki/api/v2${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Confluence API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async searchPages(query: string, limit = 10): Promise<ConfluencePage[]> {
    const cql = encodeURIComponent(query);
    const result = await this.request<ConfluenceSearchResult>(
      `/pages?title=${cql}&limit=${limit}&sort=-modified-date`
    );
    return result.results;
  }

  async searchByTitle(titleContains: string, limit = 10): Promise<ConfluencePage[]> {
    const result = await this.request<ConfluenceSearchResult>(
      `/pages?title=${encodeURIComponent(titleContains)}&limit=${limit}&sort=-modified-date`
    );
    return result.results;
  }

  async searchByCQL(cql: string, limit = 10): Promise<ConfluencePage[]> {
    const url = `${this.baseUrl}/wiki/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=${limit}&expand=version`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${this.auth}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Confluence CQL search error ${response.status}: ${text}`);
    }

    const data = await response.json();
    return data.results.map((r: any) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      _links: {
        webui: `${this.baseUrl}/wiki${r._links.webui}`,
        self: r._links.self,
      },
      version: r.version,
    }));
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const url = `${this.baseUrl}/wiki/rest/api/user/current`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${this.auth}`,
          Accept: 'application/json',
        },
      });
      
      if (!response.ok) {
        const text = await response.text();
        return { success: false, message: `Auth failed (${response.status}): ${text}` };
      }
      
      const user = await response.json();
      return { success: true, message: `Authenticated as: ${user.displayName || user.username}` };
    } catch (error) {
      return { success: false, message: `Connection error: ${error}` };
    }
  }

  async getRecentDNAPages(limit = 3): Promise<ConfluencePage[]> {
    const cql = `title ~ "DNA" OR title ~ "Discovery Notes" ORDER BY lastmodified DESC`;
    return this.searchByCQL(cql, limit);
  }

  getPageUrl(page: ConfluencePage): string {
    return page._links.webui;
  }
}

export async function getLastDNALinks(count = 3): Promise<{ title: string; url: string; modified?: string }[]> {
  const client = new ConfluenceClient();
  const pages = await client.getRecentDNAPages(count);
  
  return pages.map((page) => ({
    title: page.title,
    url: client.getPageUrl(page),
    modified: page.version?.when,
  }));
}

export async function searchDNAByMerchant(merchantName: string): Promise<{ title: string; url: string; modified?: string }[]> {
  const client = new ConfluenceClient();
  const cql = `title ~ "DNA" AND title ~ "${merchantName}" ORDER BY lastmodified DESC`;
  const pages = await client.searchByCQL(cql, 5);
  
  return pages.map((page) => ({
    title: page.title,
    url: client.getPageUrl(page),
    modified: page.version?.when,
  }));
}
