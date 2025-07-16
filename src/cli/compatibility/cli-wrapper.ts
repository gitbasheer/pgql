#!/usr/bin/env node

/**
 * CLI Compatibility Wrapper
 * Ensures all CLI commands maintain stable interfaces for automation
 */

import { Command } from 'commander';
import { createOutputAdapter, OutputOptions } from './output-adapter.js';

export interface CliWrapperOptions {
  preserveExitCodes?: boolean;
  validateOutput?: boolean;
  enforceVersioning?: boolean;
}

export class CliWrapper {
  private program: Command;
  private options: CliWrapperOptions;

  constructor(program: Command, options: CliWrapperOptions = {}) {
    this.program = program;
    this.options = {
      preserveExitCodes: true,
      validateOutput: true,
      enforceVersioning: true,
      ...options,
    };

    this.setupCompatibilityLayer();
  }

  /**
   * Setup compatibility layer for all commands
   */
  private setupCompatibilityLayer(): void {
    // Add global output options
    this.program
      .option('--output-version <version>', 'Output format version', '1.0')
      .option('--legacy-format', 'Use legacy output format')
      .option('--json', 'Output JSON to stdout')
      .option('--quiet', 'Suppress progress indicators')
      .option('--no-color', 'Disable colored output');

    // Hook into all commands to ensure compatibility
    this.program.commands.forEach((cmd) => {
      this.wrapCommand(cmd);
    });

    // Override error handling for consistent exit codes
    this.program.exitOverride((err) => {
      this.handleExit(err.exitCode || 1, err.message);
    });

    // Ensure help doesn't break automation
    this.program.configureHelp({
      sortSubcommands: true,
      subcommandTerm: (cmd) => cmd.name(),
    });
  }

  /**
   * Wrap individual command for compatibility
   */
  private wrapCommand(command: Command): void {
    // @ts-ignore: Temporary fix for security work
    const originalAction = (command as any)._actionHandler;

    command.action(async (...args) => {
      try {
        // Extract options from args
        const options = args[args.length - 1];

        // Create output adapter
        const adapter = createOutputAdapter(options);

        // Inject adapter into context
        options._outputAdapter = adapter;

        // Disable progress indicators if needed
        if (options.quiet || process.env.PG_CLI_NO_PROGRESS === '1') {
          process.env.FORCE_COLOR = '0';
        }

        // Call original action
        if (originalAction) {
          await originalAction.apply(command, args);
        }

        // Ensure clean exit
        this.handleExit(0);
      } catch (error) {
        this.handleError(error);
      }
    });

    // Recursively wrap subcommands
    command.commands.forEach((subcmd) => {
      this.wrapCommand(subcmd);
    });
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: any): void {
    const exitCode = error.exitCode || 1;
    const message = error.message || 'Unknown error';

    // Always output errors to stderr
    console.error(message);

    // Output error as JSON if requested
    const options = this.program.opts();
    if (options.json) {
      console.error(
        JSON.stringify(
          {
            error: true,
            message: message,
            exitCode: exitCode,
          },
          null,
          2,
        ),
      );
    }

    this.handleExit(exitCode, message);
  }

  /**
   * Handle exit with proper code
   */
  private handleExit(code: number, message?: string): never {
    if (this.options.preserveExitCodes) {
      process.exit(code);
    } else {
      // For testing, throw instead of exiting
      throw new Error(`Exit ${code}: ${message}`);
    }
  }

  /**
   * Validate that output matches expected schema
   */
  async validateOutput(output: any, schemaName: string): Promise<boolean> {
    if (!this.options.validateOutput) {
      return true;
    }

    try {
      // In production, this would validate against JSON schemas
      // For now, basic structure validation
      switch (schemaName) {
        case 'extraction':
          return this.validateExtractionOutput(output);
        case 'transformation':
          return this.validateTransformationOutput(output);
        case 'validation':
          return this.validateValidationOutput(output);
        default:
          return true;
      }
    } catch (error) {
      console.error('Output validation failed:', error);
      return false;
    }
  }

  private validateExtractionOutput(output: any): boolean {
    const required = ['timestamp', 'directory', 'totalQueries', 'queries'];
    return required.every((field) => field in output);
  }

  private validateTransformationOutput(output: any): boolean {
    const required = ['timestamp', 'totalTransformed', 'transformations'];
    return required.every((field) => field in output);
  }

  private validateValidationOutput(output: any): boolean {
    const required = ['timestamp', 'results'];
    return required.every((field) => field in output);
  }
}

/**
 * Create a backward-compatible CLI wrapper
 */
export function createCompatibleCLI(program: Command): CliWrapper {
  return new CliWrapper(program);
}

/**
 * Helper to ensure stable command execution
 */
export async function executeCommand(
  command: string[],
  options: OutputOptions & { env?: Record<string, string> } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      env: {
        ...process.env,
        ...options.env,
        PG_CLI_OUTPUT_VERSION: options.outputVersion || '1.0',
        PG_CLI_NO_PROGRESS: options.quiet ? '1' : options.env?.PG_CLI_NO_PROGRESS || '0',
        FORCE_COLOR: '0' // Disable colors for parsing
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code || 0,
        stdout,
        stderr,
      });
    });
  });
}
