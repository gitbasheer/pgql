/**
 * Centralized configuration management for pgql
 * Validates and provides type-safe access to all configuration
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';

// Configuration schema with validation
const ConfigSchema = z.object({
  // API Configuration
  api: z.object({
    authIdp: z.string().optional(),
    authToken: z.string().optional(),
    baseUrl: z.string().url().default('https://api.example.com'),
    timeout: z.number().positive().default(30000),
  }),

  // Cache Configuration
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().positive().default(3600000), // 1 hour
    maxSize: z.number().positive().default(1000),
    persistentPath: z.string().default('.pgql-cache'),
  }),

  // Extraction Configuration
  extraction: z.object({
    strategy: z.enum(['pluck', 'ast', 'hybrid']).default('hybrid'),
    parallel: z.boolean().default(true),
    maxConcurrency: z.number().positive().default(4),
    incrementalEnabled: z.boolean().default(false),
  }),

  // Logging Configuration
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'pretty']).default('pretty'),
  }),

  // Schema Configuration
  schema: z.object({
    defaultPath: z.string().default('./schema.graphql'),
    productGraphUrl: z.string().url().optional(),
    offerGraphUrl: z.string().url().optional(),
  }),

  // Testing Configuration
  testing: z.object({
    realApiEnabled: z.boolean().default(false),
    testingAccountPath: z.string().default('./testing-account.json'),
    mockMode: z.boolean().default(true),
  }),

  // Environment
  environment: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  debug: z.boolean().default(false),
});

export type PgqlConfig = z.infer<typeof ConfigSchema>;

class ConfigManager {
  private static instance: ConfigManager;
  private config: PgqlConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): PgqlConfig {
    const rawConfig = {
      api: {
        authIdp: process.env.AUTH_IDP,
        authToken: process.env.AUTH_TOKEN,
        baseUrl: process.env.API_BASE_URL || 'https://api.example.com',
        timeout: Number(process.env.API_TIMEOUT) || 30000,
      },
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        ttl: Number(process.env.CACHE_TTL) || 3600000,
        maxSize: Number(process.env.CACHE_MAX_SIZE) || 1000,
        persistentPath: process.env.CACHE_PATH || '.pgql-cache',
      },
      extraction: {
        strategy: (process.env.EXTRACTION_STRATEGY as any) || 'hybrid',
        parallel: process.env.EXTRACTION_PARALLEL !== 'false',
        maxConcurrency: Number(process.env.EXTRACTION_CONCURRENCY) || 4,
        incrementalEnabled: process.env.INCREMENTAL_EXTRACTION === 'true',
      },
      logging: {
        level: (process.env.LOG_LEVEL as any) || 'info',
        format: (process.env.LOG_FORMAT as any) || 'pretty',
      },
      schema: {
        defaultPath: process.env.SCHEMA_PATH || './schema.graphql',
        productGraphUrl: process.env.PRODUCT_GRAPH_URL,
        offerGraphUrl: process.env.OFFER_GRAPH_URL,
      },
      testing: {
        realApiEnabled: process.env.REAL_API_ENABLED === 'true',
        testingAccountPath: process.env.TESTING_ACCOUNT_PATH || './testing-account.json',
        mockMode: process.env.MOCK_MODE !== 'false',
      },
      environment: (process.env.NODE_ENV as any) || 'development',
      debug: process.env.DEBUG === 'true',
    };

    try {
      return ConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Configuration validation failed:', error.errors);
        throw new Error(`Invalid configuration: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  get(): PgqlConfig {
    return this.config;
  }

  getApi() {
    return this.config.api;
  }

  getCache() {
    return this.config.cache;
  }

  getExtraction() {
    return this.config.extraction;
  }

  getLogging() {
    return this.config.logging;
  }

  getSchema() {
    return this.config.schema;
  }

  getTesting() {
    return this.config.testing;
  }

  isProduction() {
    return this.config.environment === 'production';
  }

  isDevelopment() {
    return this.config.environment === 'development';
  }

  isTest() {
    return this.config.environment === 'test';
  }

  isDebug() {
    return this.config.debug;
  }

  /**
   * Override configuration for testing
   */
  override(overrides: Partial<PgqlConfig>): void {
    this.config = { ...this.config, ...overrides };
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = this.loadConfig();
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();

// Export config getter for convenience
export const getConfig = () => config.get();

// Export specific config sections
export const getApiConfig = () => config.getApi();
export const getCacheConfig = () => config.getCache();
export const getExtractionConfig = () => config.getExtraction();
export const getLoggingConfig = () => config.getLogging();
export const getSchemaConfig = () => config.getSchema();
export const getTestingConfig = () => config.getTesting();

// Environment helpers
export const isProduction = () => config.isProduction();
export const isDevelopment = () => config.isDevelopment();
export const isTest = () => config.isTest();
export const isDebug = () => config.isDebug();