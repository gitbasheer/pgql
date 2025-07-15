/**
 * Auth utilities for constructing headers from environment variables
 */

/**
 * Construct auth cookies from environment variables
 * Does NOT log sensitive data
 */
export function constructAuthCookies(): string {
  const authIdp = import.meta.env.REACT_APP_AUTH_IDP || '';
  const custIdp = import.meta.env.REACT_APP_CUST_IDP || '';
  const infoCustIdp = import.meta.env.REACT_APP_INFO_CUST_IDP || '';
  const infoIdp = import.meta.env.REACT_APP_INFO_IDP || '';
  
  return `auth_idp=${authIdp}; cust_idp=${custIdp}; info_cust_idp=${infoCustIdp}; info_idp=${infoIdp}`;
}

/**
 * Get auth headers for API requests
 */
export function getAuthHeaders(): Record<string, string> {
  return {
    'x-app-key': 'vnext-dashboard',
    'Cookie': constructAuthCookies(),
  };
}

/**
 * Get bearer token if available
 */
export function getBearerToken(): string | null {
  const token = import.meta.env.REACT_APP_API_TOKEN;
  return token ? `Bearer ${token}` : null;
}

/**
 * Get full auth headers including bearer token
 */
export function getFullAuthHeaders(): Record<string, string> {
  const headers = getAuthHeaders();
  const bearerToken = getBearerToken();
  
  if (bearerToken) {
    headers['Authorization'] = bearerToken;
  }
  
  return headers;
}

/**
 * Mask sensitive auth data for display/logging
 */
export function maskAuthData(value: string): string {
  if (!value) return '';
  
  // For tokens/keys, show first 4 chars and mask the rest
  if (value.length > 8) {
    return value.substring(0, 4) + '*'.repeat(value.length - 4);
  }
  
  // For short values, mask completely
  return '*'.repeat(value.length);
}