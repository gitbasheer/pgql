import * as path from 'path';
import { logger } from './logger';

/**
 * Secure path validation utility to prevent directory traversal attacks
 * SECURITY: This module provides centralized path validation for all file operations
 */

/**
 * Validate and resolve a path to prevent directory traversal attacks
 * @param baseDir Base directory to resolve from (or null to use project root)
 * @param userPath User-provided path
 * @returns Resolved path if safe, null if potentially malicious
 */
export function validatePath(baseDir: string | null, userPath: string): string | null {
  // SECURITY: Prevent directory traversal attacks
  
  // Reject null, undefined, or empty paths
  if (!userPath || typeof userPath !== 'string') {
    logger.warn('Invalid path provided: empty or non-string');
    return null;
  }
  
  // Reject obvious traversal attempts
  if (userPath.includes('..') || userPath.includes('~') || userPath.includes('\0')) {
    logger.warn(`Potential path traversal attempt blocked: ${userPath}`);
    return null;
  }
  
  // Use project root if no base directory specified
  const projectRoot = path.normalize(process.cwd());
  const effectiveBase = baseDir ? path.normalize(baseDir) : projectRoot;
  
  // Normalize and resolve the path
  const resolved = path.resolve(effectiveBase, userPath);
  const normalized = path.normalize(resolved);
  
  // Ensure the resolved path is within allowed directories
  const allowedDirs = [
    projectRoot,
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'data'),
    path.join(projectRoot, 'dist'),
    path.join(projectRoot, 'output'),
    path.join(projectRoot, 'test-pipeline')
  ];
  
  // Check if path is within any allowed directory
  const isAllowed = allowedDirs.some(dir => normalized.startsWith(path.normalize(dir)));
  
  if (!isAllowed) {
    logger.warn(`Path outside allowed directories blocked: ${userPath}`);
    return null;
  }
  
  // Additional check: ensure no sneaky traversals after normalization
  const relative = path.relative(projectRoot, normalized);
  if (relative.startsWith('..')) {
    logger.warn(`Path traversal outside project blocked: ${userPath}`);
    return null;
  }
  
  // Check for sensitive directories
  const sensitiveDirs = ['node_modules', '.git', '.env'];
  const relativeLower = relative.toLowerCase();
  for (const sensitive of sensitiveDirs) {
    if (relativeLower.includes(sensitive)) {
      logger.warn(`Access to sensitive directory blocked: ${userPath}`);
      return null;
    }
  }
  
  return normalized;
}

/**
 * Validate a file path for reading operations
 * @param filePath User-provided file path
 * @returns Validated path or null if invalid
 */
export function validateReadPath(filePath: string): string | null {
  const validated = validatePath(null, filePath);
  
  if (!validated) {
    return null;
  }
  
  // Additional checks for read operations
  // Allow common file extensions
  const allowedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.graphql', '.gql', '.json', '.md'];
  const ext = path.extname(validated).toLowerCase();
  
  if (ext && !allowedExtensions.includes(ext)) {
    logger.warn(`Suspicious file extension for read: ${ext}`);
    // Still allow but log warning
  }
  
  return validated;
}

/**
 * Validate a file path for writing operations
 * @param outputDir Output directory
 * @param fileName File name to write
 * @returns Validated path or null if invalid
 */
export function validateWritePath(outputDir: string, fileName: string): string | null {
  // Validate the output directory first
  const validatedDir = validatePath(null, outputDir);
  if (!validatedDir) {
    return null;
  }
  
  // Validate the filename
  if (!fileName || typeof fileName !== 'string') {
    logger.warn('Invalid filename provided');
    return null;
  }
  
  // Reject dangerous characters in filename
  const dangerousChars = ['..', '/', '\\', '\0', '~'];
  for (const char of dangerousChars) {
    if (fileName.includes(char)) {
      logger.warn(`Dangerous character in filename blocked: ${fileName}`);
      return null;
    }
  }
  
  // Construct and validate full path
  const fullPath = path.join(validatedDir, fileName);
  return validatePath(validatedDir, fileName);
}

/**
 * Create a safe file name from user input
 * @param unsafeName User-provided file name
 * @returns Safe file name
 */
export function sanitizeFileName(unsafeName: string): string {
  // Remove path separators and dangerous characters
  return unsafeName
    .replace(/[\/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[^\w\s.-]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 255); // Limit length
}