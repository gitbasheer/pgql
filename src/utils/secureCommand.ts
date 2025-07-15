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
  options: SecureCommandOptions = {}
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
    const safeArgs = args.map(arg => String(arg));
    
    logger.debug(`Executing secure command: ${command} ${safeArgs.join(' ')}`);
    
    const child = spawn(command, safeArgs, {
      ...spawnOptions,
      // Never use shell
      shell: false,
      // Capture output
      stdio: ['pipe', 'pipe', 'pipe']
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
          exitCode: code
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
  options?: SecureCommandOptions
): Promise<CommandResult> {
  return execSecure('git', args, options);
}

/**
 * GitHub CLI secure command execution
 */
export async function execGH(
  args: string[],
  options?: SecureCommandOptions
): Promise<CommandResult> {
  return execSecure('gh', args, options);
}

/**
 * Validate branch name to prevent injection
 */
export function validateBranchName(branch: string): boolean {
  // Allow alphanumeric, hyphens, underscores, forward slashes, and dots
  // This matches common branch naming patterns like feature/BA-302, release_v1.0.0
  const validBranchPattern = /^[a-zA-Z0-9/_.-]+$/;
  
  // Additional validation: prevent common injection patterns
  const dangerousPatterns = [
    /\$\(/, // Command substitution
    /`/,    // Backticks
    /;/,    // Command separator
    /\|/,   // Pipe
    /&/,    // Background/chain
    />/,    // Redirect
    /</,    // Input redirect
    /\*/,   // Wildcard (could be dangerous in some contexts)
    /\?/,   // Wildcard
    /\[/,   // Character class
    /\]/,   // Character class
    /\s/,   // Whitespace (except in paths)
    /\.\./  // Directory traversal
  ];
  
  if (!validBranchPattern.test(branch)) {
    return false;
  }
  
  // Check for dangerous patterns
  for (const pattern of dangerousPatterns) {
    if (pattern.test(branch)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate file path to prevent traversal
 */
export function validateFilePath(filePath: string, basePath: string): boolean {
  const path = require('path');
  const resolved = path.resolve(basePath, filePath);
  const normalized = path.normalize(resolved);
  
  // Ensure the resolved path is within the base path
  return normalized.startsWith(path.normalize(basePath));
}

/**
 * Escape commit message for safe usage
 * Uses stdin instead of command line arguments for complex messages
 */
export async function gitCommitSecure(
  message: string,
  options?: SecureCommandOptions
): Promise<CommandResult> {
  // Use stdin to pass commit message safely
  return execGit(['commit', '-F', '-'], {
    ...options,
    input: message
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
    stderr: result.stderr
  };
};