import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
// Mock modules
vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecAsync),
}));

// Use vi.hoisted to ensure mocks are set up before imports
const { mockExecAsync } = vi.hoisted(() => {
  const mockExecAsync = vi.fn();
  return { mockExecAsync };
});

// Mock modules at the module level
vi.mock('../../utils/logger');

describe('GitHubService', () => {
  let GitHubService: any;
  let service: any;
  let tempDir: string;

  beforeEach(async () => {
    vi.resetModules();
    // Clear all mocks
    vi.clearAllMocks();

    // Reset the mock function completely
    mockExecAsync.mockReset();
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

    // Setup logger mocks
    const loggerModule = await import('../../utils/logger.js');
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };
    vi.mocked(loggerModule).logger = mockLogger as any;

    // Import the module after mocks are set up
    const githubModule = await import('../../core/integration/GitHubService.js');
    GitHubService = githubModule.GitHubService;

    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-service-test-'));
    service = new GitHubService(tempDir);
  });

  afterEach(async () => {
    // Clean up - only if tempDir was created
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors if directory doesn't exist
      }
    }
    vi.clearAllMocks();
    mockExecAsync.mockReset();
  });

  describe('validateGitHub', () => {
    it('should return true when GitHub CLI is authenticated', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: 'Logged in as user', stderr: '' });

      const result = await service.validateGitHub();
      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith('gh auth status', expect.any(Object));
    });

    it('should return false when GitHub CLI is not authenticated', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Not authenticated'));

      const result = await service.validateGitHub();
      expect(result).toBe(false);
    });
  });

  describe('getGitStatus', () => {
    it('should detect git repository and return status', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '.git', stderr: '' }) // git rev-parse --git-dir
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // git branch --show-current
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain
        .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo.git\n', stderr: '' }); // git remote get-url origin

      const status = await service.getGitStatus();

      expect(status.isGitRepo).toBe(true);
      expect(status.currentBranch).toBe('main');
      expect(status.hasUncommittedChanges).toBe(false);
      expect(status.remoteUrl).toBe('https://github.com/user/repo.git');
    });

    it('should return false when not a git repository', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Not a git repository'));

      const status = await service.getGitStatus();
      expect(status.isGitRepo).toBe(false);
    });

    it('should detect uncommitted changes', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '.git', stderr: '' }) // git rev-parse --git-dir
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // git branch --show-current
        .mockResolvedValueOnce({ stdout: 'M  src/file.ts\n?? new-file.js', stderr: '' }) // git status --porcelain
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git remote get-url origin

      const status = await service.getGitStatus();
      expect(status.hasUncommittedChanges).toBe(true);
    });
  });

  describe('createFeatureBranch', () => {
    it('should create and checkout a new branch', async () => {
      // Mock git status check
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '.git', stderr: '' }) // git rev-parse --git-dir
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // git branch --show-current
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git remote get-url origin
        .mockResolvedValueOnce({ stdout: 'Switched to a new branch', stderr: '' }); // git checkout -b

      const result = await service.createFeatureBranch('feature-branch');
      expect(result).toBe('feature-branch');
      expect(mockExecAsync).toHaveBeenCalledWith(
        'git checkout -b feature-branch',
        expect.any(Object),
      );
    });

    it('should throw error if not a git repository', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Not a git repository'));

      await expect(service.createFeatureBranch('feature-branch')).rejects.toThrow(
        'Not a git repository',
      );
    });

    it('should throw error if there are uncommitted changes', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '.git', stderr: '' }) // git rev-parse --git-dir
        .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // git branch --show-current
        .mockResolvedValueOnce({ stdout: 'M  src/file.ts', stderr: '' }); // git status --porcelain

      await expect(service.createFeatureBranch('feature-branch')).rejects.toThrow(
        'Uncommitted changes detected',
      );
    });
  });

  describe('stageFiles', () => {
    it('should stage multiple files', async () => {
      const files = ['file1.ts', 'file2.ts'];
      mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await service.stageFiles(files);

      expect(mockExecAsync).toHaveBeenCalledTimes(files.length);
      expect(mockExecAsync).toHaveBeenCalledWith('git add "file1.ts"', expect.any(Object));
      expect(mockExecAsync).toHaveBeenCalledWith('git add "file2.ts"', expect.any(Object));
    });

    it('should throw error if no files provided', async () => {
      await expect(service.stageFiles([])).rejects.toThrow('No files to stage');
    });

    it('should throw error if staging fails', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Failed to stage'));

      await expect(service.stageFiles(['file.ts'])).rejects.toThrow(
        'Failed to stage file: file.ts',
      );
    });
  });

  describe('createCommit', () => {
    it('should create a commit with message', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '[main abc123] Test commit', stderr: '' });

      const hash = await service.createCommit('Test commit');
      expect(hash).toBe('abc123');
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('git commit -m'),
        expect.any(Object),
      );
    });

    it('should create a commit with message and description', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '[main def456] Test commit', stderr: '' });

      const hash = await service.createCommit('Test commit', 'Detailed description');
      expect(hash).toBe('def456');
    });

    it('should throw error if nothing to commit', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('nothing to commit'));

      await expect(service.createCommit('Test')).rejects.toThrow('No changes to commit');
    });
  });

  describe('pushToRemote', () => {
    it('should push current branch to remote', async () => {
      // Mock getting current branch
      mockExecAsync
        .mockResolvedValueOnce({ stdout: '.git', stderr: '' }) // git rev-parse --git-dir
        .mockResolvedValueOnce({ stdout: 'feature-branch\n', stderr: '' }) // git branch --show-current
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git remote get-url origin
        .mockResolvedValueOnce({ stdout: 'Branch pushed', stderr: '' }); // git push

      await service.pushToRemote();

      expect(mockExecAsync).toHaveBeenLastCalledWith(
        'git push -u origin feature-branch',
        expect.any(Object),
      );
    });

    it('should handle upstream branch setup', async () => {
      mockExecAsync
        .mockRejectedValueOnce(new Error('no upstream branch'))
        .mockResolvedValueOnce({ stdout: 'Branch pushed with upstream', stderr: '' });

      await service.pushToRemote('feature-branch');

      expect(mockExecAsync).toHaveBeenLastCalledWith(
        expect.stringContaining('--set-upstream origin'),
        expect.any(Object),
      );
    });
  });

  describe('generatePRBody', () => {
    it('should generate formatted PR body from migration summary', async () => {
      const summary = {
        totalFiles: 10,
        totalQueries: 25,
        transformedQueries: 20,
        deprecationsFixed: 15,
        filesModified: ['src/file1.ts', 'src/file2.ts'],
        validationPassed: true,
      };

      const body = service.generatePRBody(summary);

      expect(body).toContain('## GraphQL Schema Migration Summary');
      expect(body).toContain('**Total files scanned**: 10');
      expect(body).toContain('**Queries transformed**: 20');
      expect(body).toContain('**Deprecations fixed**: 15');
      expect(body).toContain('src/file1.ts');
      expect(body).toContain('✅ All transformations validated successfully');
    });

    it('should handle validation failure', async () => {
      const summary = {
        totalFiles: 5,
        totalQueries: 10,
        transformedQueries: 8,
        deprecationsFixed: 6,
        filesModified: [],
        validationPassed: false,
      };

      const body = service.generatePRBody(summary);
      expect(body).toContain('⚠️ Some validations require manual review');
    });
  });

  describe('generateBranchName', () => {
    it('should generate branch name with default prefix', async () => {
      const name = service.generateBranchName();
      expect(name).toMatch(/^graphql-migration-\d{8}-\d{4}$/);
    });

    it('should generate branch name with custom prefix', async () => {
      const name = service.generateBranchName('custom-prefix');
      expect(name).toMatch(/^custom-prefix-\d{8}-\d{4}$/);
    });
  });

  describe('createPR', () => {
    it('should create a pull request', async () => {
      // Mock GitHub CLI validation
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'Logged in', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo/pull/123', stderr: '' })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            number: 123,
            url: 'https://github.com/user/repo/pull/123',
            title: 'Test PR',
            body: 'Test body',
            baseRefName: 'main',
            headRefName: 'feature-branch',
          }),
          stderr: '',
        });

      const pr = await service.createPR({
        title: 'Test PR',
        body: 'Test body',
      });

      expect(pr.number).toBe(123);
      expect(pr.url).toBe('https://github.com/user/repo/pull/123');
      expect(pr.title).toBe('Test PR');

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('gh pr create'),
        expect.any(Object),
      );
    });

    it('should handle PR options', async () => {
      // Clear previous mock calls to avoid contamination
      mockExecAsync.mockClear();

      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'Logged in', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'https://github.com/user/repo/pull/456', stderr: '' })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            number: 456,
            url: 'https://github.com/user/repo/pull/456',
            title: 'Test',
            body: 'Body',
            baseRefName: 'develop',
            headRefName: 'feature',
          }),
          stderr: '',
        });

      await service.createPR({
        title: 'Test',
        body: 'Body',
        base: 'develop',
        draft: true,
        labels: ['bug', 'enhancement'],
        assignees: ['user1', 'user2'],
        reviewers: ['reviewer1'],
      });

      // Check the second call which should be the PR creation
      const prCreateCall = mockExecAsync.mock.calls[1];
      expect(prCreateCall).toBeDefined();
      const createCommand = prCreateCall[0];

      expect(createCommand).toContain('--base develop');
      expect(createCommand).toContain('--draft');
      expect(createCommand).toContain('--label bug,enhancement');
      expect(createCommand).toContain('--assignee user1,user2');
      expect(createCommand).toContain('--reviewer reviewer1');
    });

    it('should throw error if not authenticated', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Not authenticated'));

      await expect(
        service.createPR({
          title: 'Test',
          body: 'Body',
        }),
      ).rejects.toThrow('GitHub CLI not authenticated');
    });
  });
});
