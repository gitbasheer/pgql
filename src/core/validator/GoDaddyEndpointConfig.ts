import { EndpointConfig } from './types';
import { logger } from '../../utils/logger';

export interface GoDaddySSO {
  authIdp: string;
  custIdp: string;
  infoCustIdp: string;
  infoIdp: string;
}

export interface GoDaddyEndpointOptions {
  environment?: 'production' | 'staging' | 'development';
  sso?: GoDaddySSO;
  autoSSO?: boolean;
  ssoCredentials?: {
    username: string;
    password: string;
  };
}

export class GoDaddyEndpointConfig {
  private static readonly PRODUCTION_URL = 'https://pg.api.godaddy.com/v1/gql/customer';
  private static readonly REQUIRED_COOKIES = ['auth_idp', 'cust_idp', 'info_cust_idp', 'info_idp'];

  static createEndpoint(options: GoDaddyEndpointOptions = {}): EndpointConfig {
    const { environment = 'production', sso, autoSSO = false, ssoCredentials } = options;

    // Base configuration
    const config: EndpointConfig = {
      url: this.PRODUCTION_URL,
      name: 'godaddy-pg-api',
      environment,
      timeout: 30000,
      retryPolicy: {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      },
      headers: {
        'User-Agent': 'pg-migration-620/1.0.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    // Configure authentication
    if (sso) {
      // Direct cookie authentication
      config.authentication = {
        type: 'cookie',
        cookies: {
          cookies: {
            auth_idp: sso.authIdp,
            cust_idp: sso.custIdp,
            info_cust_idp: sso.infoCustIdp,
            info_idp: sso.infoIdp
          },
          secure: true,
          sameSite: 'none'
        }
      };
    } else if (autoSSO && ssoCredentials) {
      // SSO with auto-login
      config.authentication = {
        type: 'sso',
        ssoConfig: {
          provider: 'godaddy',
          credentials: ssoCredentials,
          requiredCookies: this.REQUIRED_COOKIES,
          tokenRefreshInterval: 3600000 // 1 hour
        }
      };
    } else {
      logger.warn('No authentication configured for GoDaddy endpoint');
    }

    return config;
  }

  /**
   * Create multiple endpoints for different GoDaddy APIs
   */
  static createEndpoints(apis: string[], options: GoDaddyEndpointOptions = {}): EndpointConfig[] {
    // For future use when multiple endpoints are needed
    return apis.map(api => {
      const config = this.createEndpoint(options);
      config.url = `https://pg.api.godaddy.com/v1/gql/${api}`;
      config.name = `godaddy-pg-api-${api}`;
      return config;
    });
  }

  /**
   * Validate that all required cookies are present
   */
  static validateCookies(cookies: Record<string, string>): boolean {
    return this.REQUIRED_COOKIES.every(name => name in cookies && cookies[name]);
  }

  /**
   * Parse cookies from a cookie string
   */
  static parseCookieString(cookieString: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieString.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=').map(s => s?.trim());
      if (name && value) {
        cookies[name] = value;
      }
    });
    return cookies;
  }
} 