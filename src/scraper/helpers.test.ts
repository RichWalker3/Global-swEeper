/**
 * Tests for scraper helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  detectBotBlock,
  classifyError,
  getRandomUserAgent,
  getRandomViewport,
  USER_AGENTS,
  VIEWPORTS,
} from './helpers.js';

describe('detectBotBlock', () => {
  describe('Cloudflare detection', () => {
    it('detects Cloudflare by title "Just a moment"', () => {
      const result = detectBotBlock('<html></html>', 'Just a moment...');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('cloudflare');
    });

    it('detects Cloudflare by title "Attention Required"', () => {
      const result = detectBotBlock('<html></html>', 'Attention Required! | Cloudflare');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('cloudflare');
    });

    it('detects Cloudflare by cf-browser-verification in HTML', () => {
      const html = '<div id="cf-browser-verification">Checking your browser</div>';
      const result = detectBotBlock(html, 'Some Site');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('cloudflare');
    });

    it('detects Cloudflare by cf_chl_opt in HTML', () => {
      const html = '<script>var cf_chl_opt = {};</script>';
      const result = detectBotBlock(html, 'Some Site');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('cloudflare');
    });

    it('detects Cloudflare Turnstile', () => {
      const html = '<div class="cf-turnstile">Challenge</div>';
      const result = detectBotBlock(html, 'Some Site');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('cloudflare');
    });

    it('detects "Checking your browser" text', () => {
      const html = '<p>Checking your browser before accessing the site.</p>';
      const result = detectBotBlock(html, 'Loading...');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('cloudflare');
    });
  });

  describe('PerimeterX detection', () => {
    it('detects PerimeterX captcha', () => {
      const html = '<div id="_pxCaptcha">Solve the captcha</div>';
      const result = detectBotBlock(html, 'Some Site');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('perimeterx');
    });

    it('detects PerimeterX "Press & Hold"', () => {
      const html = '<p>Press & Hold to verify you are human</p>';
      const result = detectBotBlock(html, 'Verification');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('perimeterx');
    });

    it('detects perimeterx in HTML', () => {
      const html = '<script src="https://client.perimeterx.net/px.js"></script>';
      const result = detectBotBlock(html, 'Some Site');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('perimeterx');
    });

    it('detects px-captcha class', () => {
      const html = '<div class="px-captcha-container">Verify</div>';
      const result = detectBotBlock(html, 'Some Site');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('perimeterx');
    });
  });

  describe('DataDome detection', () => {
    it('detects DataDome with captcha', () => {
      const html = '<div class="datadome-captcha">Verify</div>';
      const result = detectBotBlock(html, 'Some Site');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('datadome');
    });

    it('detects DataDome geo captcha delivery', () => {
      const html = '<iframe src="https://geo.captcha-delivery.com/captcha"></iframe>';
      const result = detectBotBlock(html, 'Some Site');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('datadome');
    });

    it('does not flag datadome without captcha context', () => {
      const html = '<script src="https://js.datadome.co/tags.js"></script>';
      const result = detectBotBlock(html, 'Normal Page');
      // datadome alone without "captcha" should not block
      expect(result.blocked).toBe(false);
    });
  });

  describe('Akamai detection', () => {
    it('detects Akamai challenge', () => {
      const html = '<div class="akamai-challenge">Complete the challenge</div>';
      const result = detectBotBlock(html, 'Security Check');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('akamai');
    });
  });

  describe('Generic challenge detection', () => {
    it('detects "Access Denied" title', () => {
      const result = detectBotBlock('<html></html>', 'Access Denied');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('generic-challenge');
    });

    it('detects "Verify" in title', () => {
      const result = detectBotBlock('<html></html>', 'Verify Your Identity');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('generic-challenge');
    });

    it('detects challenge-running in HTML', () => {
      const html = '<div class="challenge-running">Please wait...</div>';
      const result = detectBotBlock(html, 'Loading');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('generic-challenge');
    });

    it('detects "human verification" text', () => {
      const html = '<p>Complete human verification to continue</p>';
      const result = detectBotBlock(html, 'Verification');
      expect(result.blocked).toBe(true);
      expect(result.type).toBe('generic-challenge');
    });
  });

  describe('Normal pages', () => {
    it('does not flag normal e-commerce pages', () => {
      const html = `
        <html>
          <head><title>Cool Brand - Shop Now</title></head>
          <body>
            <h1>Welcome to Cool Brand</h1>
            <div class="products">Product listings here</div>
          </body>
        </html>
      `;
      const result = detectBotBlock(html, 'Cool Brand - Shop Now');
      expect(result.blocked).toBe(false);
      expect(result.type).toBeNull();
    });

    it('does not flag Shopify pages', () => {
      const html = '<script src="https://cdn.shopify.com/s/files/shop.js"></script>';
      const result = detectBotBlock(html, 'My Shopify Store');
      expect(result.blocked).toBe(false);
    });

    it('does not flag pages with normal verification text', () => {
      const html = '<p>Email verification sent</p>';
      const result = detectBotBlock(html, 'Account Settings');
      expect(result.blocked).toBe(false);
    });
  });
});

describe('classifyError', () => {
  describe('HTTP status codes', () => {
    it('classifies 404 as not_found', () => {
      expect(classifyError('', 404)).toBe('not_found');
    });

    it('classifies 401 as auth_required', () => {
      expect(classifyError('', 401)).toBe('auth_required');
    });

    it('classifies 403 as auth_required', () => {
      expect(classifyError('', 403)).toBe('auth_required');
    });
  });

  describe('Error messages', () => {
    it('classifies timeout errors', () => {
      expect(classifyError('Navigation timeout of 15000ms exceeded')).toBe('timeout');
      expect(classifyError('timeout waiting for element')).toBe('timeout');
      expect(classifyError('Timeout exceeded')).toBe('timeout');
    });

    it('classifies blocked errors', () => {
      expect(classifyError('Page blocked by captcha')).toBe('blocked');
      expect(classifyError('Bot challenge detected')).toBe('blocked');
      expect(classifyError('Request blocked')).toBe('blocked');
    });

    it('classifies unknown errors as other', () => {
      expect(classifyError('Some random error')).toBe('other');
      expect(classifyError('net::ERR_CONNECTION_REFUSED')).toBe('other');
    });
  });

  describe('Combined status and message', () => {
    it('prioritizes status code for 404', () => {
      expect(classifyError('timeout', 404)).toBe('not_found');
    });

    it('prioritizes status code for 401', () => {
      expect(classifyError('blocked', 401)).toBe('auth_required');
    });
  });
});

describe('getRandomUserAgent', () => {
  it('returns a user agent from the pool', () => {
    const ua = getRandomUserAgent();
    expect(USER_AGENTS).toContain(ua);
  });

  it('returns different user agents over multiple calls', () => {
    const agents = new Set<string>();
    // Call many times to increase chance of getting different values
    for (let i = 0; i < 100; i++) {
      agents.add(getRandomUserAgent());
    }
    // Should have gotten at least 2 different agents
    expect(agents.size).toBeGreaterThan(1);
  });

  it('all user agents are valid Chrome/Safari/Firefox strings', () => {
    for (const ua of USER_AGENTS) {
      expect(ua).toMatch(/Mozilla\/5\.0/);
      expect(ua).toMatch(/(Chrome|Safari|Firefox)/);
    }
  });
});

describe('getRandomViewport', () => {
  it('returns a viewport with width and height', () => {
    const vp = getRandomViewport();
    expect(vp).toHaveProperty('width');
    expect(vp).toHaveProperty('height');
    expect(typeof vp.width).toBe('number');
    expect(typeof vp.height).toBe('number');
  });

  it('returns viewports within expected range', () => {
    for (let i = 0; i < 50; i++) {
      const vp = getRandomViewport();
      // Min base is 1366, minus 30 = 1336
      // Max base is 1920, plus 30 = 1950
      expect(vp.width).toBeGreaterThanOrEqual(1336);
      expect(vp.width).toBeLessThanOrEqual(1950);
      // Min height base is 768, minus 30 = 738
      // Max height base is 1080, plus 30 = 1110
      expect(vp.height).toBeGreaterThanOrEqual(738);
      expect(vp.height).toBeLessThanOrEqual(1110);
    }
  });

  it('returns varied viewport sizes', () => {
    const widths = new Set<number>();
    for (let i = 0; i < 50; i++) {
      widths.add(getRandomViewport().width);
    }
    // Should have variation due to ±30px randomization
    expect(widths.size).toBeGreaterThan(3);
  });
});

describe('USER_AGENTS constant', () => {
  it('contains at least 5 user agents', () => {
    expect(USER_AGENTS.length).toBeGreaterThanOrEqual(5);
  });

  it('includes Chrome user agents', () => {
    const chromeAgents = USER_AGENTS.filter(ua => ua.includes('Chrome'));
    expect(chromeAgents.length).toBeGreaterThan(0);
  });

  it('includes Safari user agents', () => {
    const safariAgents = USER_AGENTS.filter(ua => ua.includes('Safari') && !ua.includes('Chrome'));
    expect(safariAgents.length).toBeGreaterThan(0);
  });

  it('includes both Mac and Windows agents', () => {
    const macAgents = USER_AGENTS.filter(ua => ua.includes('Mac'));
    const winAgents = USER_AGENTS.filter(ua => ua.includes('Windows'));
    expect(macAgents.length).toBeGreaterThan(0);
    expect(winAgents.length).toBeGreaterThan(0);
  });
});

describe('VIEWPORTS constant', () => {
  it('contains common desktop viewport sizes', () => {
    expect(VIEWPORTS.length).toBeGreaterThanOrEqual(4);
  });

  it('all viewports have reasonable dimensions', () => {
    for (const vp of VIEWPORTS) {
      expect(vp.width).toBeGreaterThanOrEqual(1280);
      expect(vp.width).toBeLessThanOrEqual(2560);
      expect(vp.height).toBeGreaterThanOrEqual(720);
      expect(vp.height).toBeLessThanOrEqual(1440);
    }
  });

  it('includes 1920x1080 (Full HD)', () => {
    const fullHD = VIEWPORTS.find(vp => vp.width === 1920 && vp.height === 1080);
    expect(fullHD).toBeDefined();
  });

  it('includes 1440x900 (common MacBook)', () => {
    const macbook = VIEWPORTS.find(vp => vp.width === 1440 && vp.height === 900);
    expect(macbook).toBeDefined();
  });
});
