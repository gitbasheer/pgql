import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { MigrationConfig } from '../types/index.js';
import { logger } from './logger.js';
import { validateReadPath } from './securePath.js';

export class ConfigLoader {
  static async load(configPath: string): Promise<MigrationConfig> {
    try {
      // SECURITY FIX: Validate path to prevent traversal
      const validatedPath = validateReadPath(configPath);
      if (!validatedPath) {
        logger.error(`Invalid config path: ${configPath}`);
        throw new Error('Invalid configuration file path');
      }

      // Check if config file exists
      await fs.access(validatedPath);

      // Read config file
      const content = await fs.readFile(validatedPath, 'utf-8');

      // Parse based on extension
      let config: MigrationConfig;
      if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
        config = yaml.parse(content);
      } else if (configPath.endsWith('.json')) {
        config = JSON.parse(content);
      } else {
        throw new Error('Unsupported config file format. Use .yaml, .yml, or .json');
      }

      // Validate and apply defaults
      return this.validateAndApplyDefaults(config);
    } catch (error) {
      logger.warn(`Failed to load config from ${configPath}, using defaults`);
      return this.getDefaultConfig();
    }
  }

  static async loadSchema(schemaPath: string): Promise<string> {
    try {
      // SECURITY FIX: Validate path to prevent traversal
      const validatedPath = validateReadPath(schemaPath);
      if (!validatedPath) {
        logger.error(`Invalid schema path: ${schemaPath}`);
        throw new Error('Invalid schema file path');
      }

      const schemaContent = await fs.readFile(validatedPath, 'utf-8');
      return schemaContent;
    } catch (error: any) {
      logger.error(`Failed to load schema from ${schemaPath}`, error);
      throw new Error(`Failed to load schema: ${error.message}`);
    }
  }

  private static validateAndApplyDefaults(config: Partial<MigrationConfig>): MigrationConfig {
    const defaultConfig = this.getDefaultConfig();

    return {
      source: {
        include: config.source?.include || defaultConfig.source.include,
        exclude: config.source?.exclude || defaultConfig.source.exclude,
      },
      confidence: {
        automatic: config.confidence?.automatic || defaultConfig.confidence.automatic,
        semiAutomatic: config.confidence?.semiAutomatic || defaultConfig.confidence.semiAutomatic,
        manual: config.confidence?.manual || defaultConfig.confidence.manual,
      },
      rollout: {
        initial: config.rollout?.initial || defaultConfig.rollout.initial,
        increment: config.rollout?.increment || defaultConfig.rollout.increment,
        interval: config.rollout?.interval || defaultConfig.rollout.interval,
        maxErrors: config.rollout?.maxErrors || defaultConfig.rollout.maxErrors,
      },
      safety: {
        requireApproval: config.safety?.requireApproval ?? defaultConfig.safety.requireApproval,
        autoRollback: config.safety?.autoRollback ?? defaultConfig.safety.autoRollback,
        healthCheckInterval:
          config.safety?.healthCheckInterval || defaultConfig.safety.healthCheckInterval,
      },
    };
  }

  private static getDefaultConfig(): MigrationConfig {
    return {
      source: {
        include: ['./src/**/*.{js,jsx,ts,tsx}'],
        exclude: ['**/node_modules/**', '**/__tests__/**', '**/*.test.*'],
      },
      confidence: {
        automatic: 90,
        semiAutomatic: 70,
        manual: 0,
      },
      rollout: {
        initial: 1,
        increment: 10,
        interval: '1h',
        maxErrors: 0.01,
      },
      safety: {
        requireApproval: true,
        autoRollback: true,
        healthCheckInterval: 60,
      },
    };
  }
}
