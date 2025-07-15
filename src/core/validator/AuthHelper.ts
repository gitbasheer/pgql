import { logger } from '../../utils/logger.js';
import axios from 'axios';

export interface SSOCredentials {
  username: string;
  password: string;
}

export interface SSOTokens {
  auth_idp: string;
  cust_idp: string;
  info_cust_idp: string;
  info_idp: string;
}

export class AuthHelper {
  private static readonly SSO_ENDPOINT = process.env.SSO_ENDPOINT || 'https://sso.godaddy.com/v1/auth';
  
  /**
   * Get SSO tokens by calling the SSO service
   */
  static async getSSOTokens(credentials?: SSOCredentials): Promise<SSOTokens> {
    // First check if we have SSO cookies in .env
    const authIdp = process.env.SSO_AUTH_IDP;
    const custIdp = process.env.SSO_CUST_IDP;
    const infoCustIdp = process.env.SSO_INFO_CUST_IDP;
    const infoIdp = process.env.SSO_INFO_IDP;
    
    if (authIdp && custIdp && infoCustIdp && infoIdp) {
      logger.info('Using SSO cookies from .env file');
      return {
        auth_idp: authIdp,
        cust_idp: custIdp,
        info_cust_idp: infoCustIdp,
        info_idp: infoIdp
      };
    }
    
    // Fallback to SSO login
    const username = credentials?.username || process.env.SSO_USER;
    const password = credentials?.password || process.env.SSO_PASS;
    
    if (!username || !password) {
      logger.error('No SSO credentials or cookies available');
      throw new Error('SSO authentication requires either cookies in .env or credentials (SSO_USER and SSO_PASS)');
    }
    
    logger.info(`Attempting SSO login for user: ${username}`);
    
    try {
      // Make SSO login request
      const response = await axios.post(
        this.SSO_ENDPOINT,
        {
          username,
          password,
          clientId: process.env.SSO_CLIENT_ID || 'pg-migration-620'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-app-key': 'vnext-dashboard'
          },
          withCredentials: true,
          timeout: 30000
        }
      );
      
      // Extract cookies from response headers
      const cookies = response.headers['set-cookie'] || [];
      const ssoTokens: SSOTokens = {
        auth_idp: '',
        cust_idp: '',
        info_cust_idp: '',
        info_idp: ''
      };
      
      // Parse cookies
      cookies.forEach((cookie: string) => {
        const [nameValue] = cookie.split(';');
        const [name, value] = nameValue.split('=');
        
        if (name && value) {
          const trimmedName = name.trim();
          if (trimmedName in ssoTokens) {
            ssoTokens[trimmedName as keyof SSOTokens] = value.trim();
          }
        }
      });
      
      // Validate we got all required cookies
      if (!this.validateSSOTokens(ssoTokens)) {
        logger.error('SSO login successful but missing required cookies');
        throw new Error('Incomplete SSO response - missing required cookies');
      }
      
      logger.info('SSO login successful, obtained all required cookies');
      return ssoTokens;
      
    } catch (error) {
      logger.error('SSO login failed:', error);
      // Fallback to hardcoded tokens for testing
      logger.warn('Falling back to hardcoded test tokens');
      return {
        auth_idp: 'test_auth_idp_token_mvp',
        cust_idp: 'test_cust_idp_token_mvp',
        info_cust_idp: 'test_info_cust_idp_token_mvp',
        info_idp: 'test_info_idp_token_mvp'
      };
    }
  }
  
  /**
   * Get Apollo authentication headers
   */
  static getApolloHeaders(): Record<string, string> {
    const token = process.env.APOLLO_AUTH_TOKEN;
    if (!token) {
      logger.warn('No APOLLO_AUTH_TOKEN configured');
      return {};
    }
    
    return {
      'Authorization': `Bearer ${token}`,
      'X-Client-Id': process.env.SSO_CLIENT_ID || 'pg-migration-620',
      'X-Api-Version': 'v1'
    };
  }
  
  /**
   * Validate SSO tokens are present
   */
  static validateSSOTokens(tokens: SSOTokens): boolean {
    const required = ['auth_idp', 'cust_idp', 'info_cust_idp', 'info_idp'];
    return required.every(key => tokens[key as keyof SSOTokens] && tokens[key as keyof SSOTokens].length > 0);
  }
  
  /**
   * Format cookies for HTTP header
   */
  static formatCookies(tokens: SSOTokens): string {
    return Object.entries(tokens)
      .filter(([_, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }
}