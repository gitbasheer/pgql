import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { SSOConfig } from './types.js';
import { GoDaddySSO } from './GoDaddyEndpointConfig.js';

export interface SSOResult {
  success: boolean;
  cookies?: GoDaddySSO;
  error?: string;
  expiresAt?: Date;
}

export class SSOService {
  private static instance: SSOService;
  private cachedCookies?: GoDaddySSO;
  private cookieExpiry?: Date;

  static getInstance(): SSOService {
    if (!this.instance) {
      this.instance = new SSOService();
    }
    return this.instance;
  }

  /**
   * Authenticate with GoDaddy SSO and retrieve required cookies
   */
  async authenticate(config: SSOConfig): Promise<SSOResult> {
    if (config.provider !== 'godaddy') {
      return {
        success: false,
        error: 'Only GoDaddy SSO is currently supported'
      };
    }

    // Check if we have valid cached cookies
    if (this.cachedCookies && this.cookieExpiry && this.cookieExpiry > new Date()) {
      logger.info('Using cached SSO cookies');
      return {
        success: true,
        cookies: this.cachedCookies,
        expiresAt: this.cookieExpiry
      };
    }

    try {
      logger.info('Starting GoDaddy SSO authentication flow');
      
      if (!config.credentials) {
        return {
          success: false,
          error: 'SSO credentials not provided. Please configure credentials or provide cookies manually.'
        };
      }

      // GoDaddy SSO endpoint
      const ssoUrl = 'https://sso.godaddy.com/v1/api/idp/login?app=pg.api&realm=idp&path=%2Fv1%2Fgql%2Fcustomer&port=443&subdomain=pg.api&status=0';
      
      // Prepare the authentication payload
      const payload = {
        plid: 1,
        corrid: Math.floor(Math.random() * 1000000000), // Random correlation ID
        password: config.credentials.password,
        API_HOST: 'godaddy.com',
        include_cdt: false,
        remember_me: true,
        include_cookies: true,
        username: config.credentials.username
      };

      // Make the authentication request
      const response = await axios.post(ssoUrl, payload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Origin': 'https://sso.godaddy.com',
          'User-Agent': 'pg-migration-620/1.0.0'
        },
        withCredentials: true,
        timeout: 30000
      });

      // Extract cookies from response
      const setCookieHeaders = response.headers['set-cookie'];
      if (!setCookieHeaders) {
        return {
          success: false,
          error: 'No cookies returned from SSO authentication'
        };
      }

      // Parse the required cookies
      const cookies: Partial<GoDaddySSO> = {};
      const requiredCookies = ['auth_idp', 'cust_idp', 'info_cust_idp', 'info_idp'];
      
      setCookieHeaders.forEach((cookieString: string) => {
        const [nameValue] = cookieString.split(';');
        const [name, value] = nameValue.split('=');
        if (requiredCookies.includes(name)) {
          cookies[name as keyof GoDaddySSO] = value;
        }
      });

      // Validate we got all required cookies
      const hasAllCookies = requiredCookies.every(name => name in cookies);
      if (!hasAllCookies) {
        const missing = requiredCookies.filter(name => !(name in cookies));
        return {
          success: false,
          error: `Missing required cookies: ${missing.join(', ')}`
        };
      }

      // Cache the cookies
      this.cachedCookies = cookies as GoDaddySSO;
      this.cookieExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      logger.info('SSO authentication successful, cookies cached');
      
      return {
        success: true,
        cookies: this.cachedCookies,
        expiresAt: this.cookieExpiry
      };

    } catch (error) {
      // Don't log the full error object as it may contain circular references
      logger.error('SSO authentication failed:', error instanceof Error ? error.message : 'Unknown error');
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return {
            success: false,
            error: 'Invalid credentials. Please check your username and password.'
          };
        } else if (error.response?.status === 403) {
          return {
            success: false,
            error: 'Access forbidden. The SSO endpoint may require additional authentication or the account may be locked.'
          };
        }
        
        // Extract error message safely
        let errorMessage = error.message;
        if (error.response?.data) {
          if (typeof error.response.data === 'string') {
            errorMessage = error.response.data;
          } else if (error.response.data.message) {
            errorMessage = error.response.data.message;
          } else if (error.response.data.error) {
            errorMessage = error.response.data.error;
          }
        }
        
        return {
          success: false,
          error: `SSO authentication failed: ${errorMessage}`
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during SSO'
      };
    }
  }

  /**
   * Manually set cookies (for testing or when SSO is not available)
   */
  setCookies(cookies: GoDaddySSO, expiryHours: number = 24): void {
    this.cachedCookies = cookies;
    this.cookieExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    logger.info(`Cookies set manually, will expire at ${this.cookieExpiry.toISOString()}`);
  }

  /**
   * Clear cached cookies
   */
  clearCache(): void {
    this.cachedCookies = undefined;
    this.cookieExpiry = undefined;
    logger.info('SSO cookie cache cleared');
  }

  /**
   * Check if SSO is properly configured and ready
   */
  isReady(): boolean {
    return !!(this.cachedCookies && this.cookieExpiry && this.cookieExpiry > new Date());
  }

  /**
   * Get current cookies if available
   */
  getCookies(): GoDaddySSO | undefined {
    if (this.isReady()) {
      return this.cachedCookies;
    }
    return undefined;
  }

  /**
   * Refresh cookies before they expire
   */
  async refreshCookies(config: SSOConfig): Promise<SSOResult> {
    if (!this.cookieExpiry) {
      return this.authenticate(config);
    }

    // Refresh if within 30 minutes of expiry
    const thirtyMinutesFromNow = new Date(Date.now() + 30 * 60 * 1000);
    if (this.cookieExpiry <= thirtyMinutesFromNow) {
      logger.info('Cookies expiring soon, refreshing...');
      this.clearCache();
      return this.authenticate(config);
    }

    return {
      success: true,
      cookies: this.cachedCookies,
      expiresAt: this.cookieExpiry
    };
  }

  /**
   * Parse cookies from browser developer tools format
   * Useful for manual cookie entry
   */
  static parseBrowserCookies(cookieString: string): Partial<GoDaddySSO> {
    const cookies: Record<string, string> = {};
    const requiredCookies = ['auth_idp', 'cust_idp', 'info_cust_idp', 'info_idp'];
    
    cookieString.split(/[;\n]/).forEach(cookie => {
      const [name, value] = cookie.trim().split('=').map(s => s.trim());
      if (name && value && requiredCookies.includes(name)) {
        cookies[name] = value;
      }
    });

    return cookies as Partial<GoDaddySSO>;
  }
} 