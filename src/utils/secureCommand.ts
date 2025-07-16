import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';

/**
 * Secure command execution utility
 * Prevents command injection by using parameterized execution
 */

export interface SecureCommandOptions extends SpawnOptionsWithoutStdio {
  timeout?: number;
  input?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Execute a command securely using spawn with array arguments
 * This prevents shell injection attacks
 */
export async function execSecure(
  command: string,
  args: string[] = [],
  options: SecureCommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const { timeout = 30000, input, ...spawnOptions } = options;

    // Validate command
    if (!command || typeof command !== 'string') {
      reject(new Error('Command must be a non-empty string'));
      return;
    }

    // Validate args
    if (!Array.isArray(args)) {
      reject(new Error('Arguments must be an array'));
      return;
    }

    // Ensure all args are strings
    const safeArgs = args.map((arg) => String(arg));

    logger.debug(`Executing secure command: ${command} ${safeArgs.join(' ')}`);

    const child = spawn(command, safeArgs, {
      ...spawnOptions,
      // Never use shell
      shell: false,
      // Capture output
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set timeout
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      reject(new Error(`Command timeout after ${timeout}ms`));
    }, timeout);

    // Capture stdout
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Capture stderr
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle input if provided
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }

    // Handle completion
    child.on('close', (code) => {
      clearTimeout(timer);

      if (!killed) {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
        });
      }
    });

    // Handle errors
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Git-specific secure command execution
 */
export async function execGit(
  args: string[],
  options?: SecureCommandOptions,
): Promise<CommandResult> {
  return execSecure('git', args, options);
}

/**
 * GitHub CLI secure command execution
 */
export async function execGH(
  args: string[],
  options?: SecureCommandOptions,
): Promise<CommandResult> {
  return execSecure('gh', args, options);
}

/**
 * Validate branch name to prevent injection
 */
export function validateBranchName(branch: string): boolean {
  // Strengthened regex - only alphanumeric, hyphens, underscores, forward slashes
  // No dots allowed to prevent confusion with refs/tags
  const validBranchPattern = /^[a-zA-Z0-9/_-]+$/;

  // Check basic pattern first
  if (!validBranchPattern.test(branch)) {
    return false;
  }

  // Additional validation: prevent common injection patterns
  const dangerousPatterns = [
    /\$/, // Any dollar sign (command substitution)
    /`/, // Backticks
    /;/, // Command separator
    /\|/, // Pipe
    /&/, // Background/chain
    />/, // Redirect
    /</, // Input redirect
    /\*/, // Wildcard
    /\?/, // Wildcard
    /\[/, // Character class
    /\]/, // Character class
    /\s/, // Whitespace
    /\.\./, // Directory traversal
    /\\/, // Backslash
    /'/, // Single quote
    /"/, // Double quote
    /\n/, // Newline
    /\r/, // Carriage return
    /\t/, // Tab
  ];

  // Check for dangerous patterns
  for (const pattern of dangerousPatterns) {
    if (pattern.test(branch)) {
      return false;
    }
  }

  // Additional checks
  if (branch.length === 0 || branch.length > 255) {
    return false;
  }

  // Cannot start or end with forward slash
  if (branch.startsWith('/') || branch.endsWith('/')) {
    return false;
  }

  return true;
}

/**
 * Validate file path to prevent traversal
 */
export function validateFilePath(filePath: string, basePath: string): boolean {
  const path = require('path');
  
  // Check for obvious traversal attempts
  if (filePath.includes('..') || filePath.includes('%2e%2e')) {
    return false;
  }
  
  // Check for absolute paths that would escape base
  if (path.isAbsolute(filePath) && !filePath.startsWith(basePath)) {
    return false;
  }
  
  // Resolve and normalize paths
  const resolvedBase = path.resolve(basePath);
  const resolvedFile = path.resolve(basePath, filePath);
  const normalizedBase = path.normalize(resolvedBase);
  const normalizedFile = path.normalize(resolvedFile);

  // Ensure the resolved path is within the base path
  // Use path separator to prevent partial matches
  const baseWithSeparator = normalizedBase.endsWith(path.sep) 
    ? normalizedBase 
    : normalizedBase + path.sep;
    
  return normalizedFile.startsWith(baseWithSeparator) || normalizedFile === normalizedBase;
}

/**
 * Escape commit message for safe usage
 * Uses stdin instead of command line arguments for complex messages
 */
export async function gitCommitSecure(
  message: string,
  options?: SecureCommandOptions,
): Promise<CommandResult> {
  // Use stdin to pass commit message safely
  return execGit(['commit', '-F', '-'], {
    ...options,
    input: message,
  });
}

// Export legacy wrapper for backward compatibility
// @deprecated Use execSecure instead
export const execAsync = async (command: string): Promise<{ stdout: string; stderr: string }> => {
  logger.warn('execAsync is deprecated and insecure. Use execSecure instead.');

  // Parse command to extract program and args (basic implementation)
  const parts = command.split(' ');
  const program = parts[0];
  const args = parts.slice(1);

  const result = await execSecure(program, args);

  if (result.exitCode !== 0) {
    throw new Error(`Command failed: ${result.stderr || result.stdout}`);
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
};
