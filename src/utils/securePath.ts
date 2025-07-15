import * as path from 'path';
import { logger } from './logger.js';

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
  
  // SECURITY FIX: Decode URL encoding (including double encoding) before validation
  let decodedPath = userPath;
  let previousPath = '';
  let decodeAttempts = 0;
  
  // Recursively decode until no more encoding is found (max 5 iterations to prevent DoS)
  while (decodedPath !== previousPath && decodeAttempts < 5) {
    previousPath = decodedPath;
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch (e) {
      // If decoding fails, use the current state
      break;
    }
    decodeAttempts++;
  }
  
  // SECURITY FIX: Block absolute paths OUTSIDE the project (Windows and Unix)
  const projectRoot = path.normalize(process.cwd());
  
  if (path.isAbsolute(decodedPath)) {
    // For absolute paths, check if they're within the project
    const normalized = path.normalize(decodedPath);
    
    if (!normalized.startsWith(projectRoot)) {
      logger.warn(`Absolute path outside project blocked: ${userPath}`);
      return null;
    }
    
    // If absolute path is within project, continue with validation
    // but use the normalized path
    decodedPath = path.relative(projectRoot, normalized);
  }
  
  // Check for Windows absolute paths that might not be caught by path.isAbsolute
  if (/^[a-zA-Z]:[\\/]/.test(decodedPath) || decodedPath.startsWith('\\\\')) {
    logger.warn(`Windows absolute path blocked: ${userPath}`);
    return null;
  }
  
  // Reject obvious traversal attempts (check both encoded and decoded)
  if (decodedPath.includes('..') || decodedPath.includes('~') || decodedPath.includes('\0') ||
      userPath.includes('..') || userPath.includes('~') || userPath.includes('\0')) {
    logger.warn(`Potential path traversal attempt blocked: ${userPath}`);
    return null;
  }
  
  // Use already-defined project root if no base directory specified
  const effectiveBase = baseDir ? path.normalize(baseDir) : projectRoot;
  
  // Normalize and resolve the path (use decoded path)
  const resolved = path.resolve(effectiveBase, decodedPath);
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
  // SECURITY: Additional pre-check for absolute paths before general validation
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }
  
  // Decode URL encoding first to catch encoded absolute paths
  let decodedPath = filePath;
  try {
    // Decode up to 5 times to catch double/triple encoding
    for (let i = 0; i < 5; i++) {
      const prev = decodedPath;
      decodedPath = decodeURIComponent(decodedPath);
      if (prev === decodedPath) break;
    }
  } catch (e) {
    // Continue with original if decode fails
  }
  
  // SECURITY FIX: Allow absolute paths IF they are within the project directory
  // This is needed because glob returns absolute paths
  const projectRoot = path.normalize(process.cwd());
  
  if (path.isAbsolute(decodedPath)) {
    // For absolute paths, ensure they're within the project
    const normalized = path.normalize(decodedPath);
    
    // Check if it's within project boundaries
    if (!normalized.startsWith(projectRoot)) {
      logger.warn(`Absolute path outside project blocked: ${filePath}`);
      return null;
    }
    
    // Check for sensitive directories even within project
    const relative = path.relative(projectRoot, normalized);
    const relativeLower = relative.toLowerCase();
    const sensitiveDirs = ['node_modules', '.git', '.env'];
    
    for (const sensitive of sensitiveDirs) {
      if (relativeLower.includes(sensitive)) {
        logger.warn(`Access to sensitive directory blocked: ${filePath}`);
        return null;
      }
    }
    
    // Absolute path within project is OK
    return normalized;
  }
  
  // For relative paths, use the general validation
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