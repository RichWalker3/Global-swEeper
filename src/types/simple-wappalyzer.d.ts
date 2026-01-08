declare module 'simple-wappalyzer' {
  interface WappalyzerInput {
    url: string;
    html: string;
    headers?: Record<string, string>;
  }

  interface WappalyzerCategory {
    id: number;
    slug: string;
    name: string;
  }

  interface WappalyzerResult {
    name: string;
    description?: string;
    slug: string;
    categories: WappalyzerCategory[];
    confidence: number;
    version: string;
    icon: string;
    website: string;
  }

  // The default export is a function that takes options and returns results
  function analyze(options: WappalyzerInput): Promise<WappalyzerResult[]>;
  
  export default analyze;
}
