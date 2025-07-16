import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';
import {
  execGit,
  execGH,
  validateBranchName,
  validateFilePath,
  gitCommitSecure,
} from '../../utils/secureCommand.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface PROptions {
  title: string;
  body: string;
  base?: string;
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
  files?: string[];
}

export interface PullRequest {
  number: number;
  url: string;
  state: 'open' | 'closed' | 'merged';
  title: string;
  body: string;
  base: string;
  head: string;
}

export interface GitStatus {
  isGitRepo: boolean;
  currentBranch?: string;
  hasUncommittedChanges?: boolean;
  remoteUrl?: string;
}

export interface MigrationSummary {
  totalFiles: number;
  totalQueries: number;
  transformedQueries: number;
  deprecationsFixed: number;
  filesModified: string[];
  validationPassed: boolean;
}

export class GitHubService {
  constructor(private readonly workingDirectory: string = process.cwd()) {
    // GitHubService initialized
  }

  /**
   * Validates GitHub CLI is installed and authenticated
   */
  async validateGitHub(): Promise<boolean> {
    try {
      const result = await execGH(['auth', 'status'], {
        cwd: this.workingDirectory,
      });

      if (result.exitCode !== 0) {
        throw new Error('GitHub CLI not authenticated');
      }
      logger.info('GitHub CLI authenticated successfully');
      return true;
    } catch (error) {
      logger.error('GitHub CLI not authenticated', error);
      return false;
    }
  }

  /**
   * Checks git repository status
   */
  async getGitStatus(): Promise<GitStatus> {
    const status: GitStatus = { isGitRepo: false };

    try {
      // Check if it's a git repository
      const result = await execGit(['rev-parse', '--git-dir'], {
        cwd: this.workingDirectory,
      });

      if (result.exitCode !== 0) {
        throw new Error('Not a git repository');
      }
      status.isGitRepo = true;

      // Get current branch
      const branchResult = await execGit(['branch', '--show-current'], {
        cwd: this.workingDirectory,
      });
      const branch = branchResult.stdout;
      status.currentBranch = branch.trim();

      // Check for uncommitted changes
      const statusResult = await execGit(['status', '--porcelain'], {
        cwd: this.workingDirectory,
      });
      const gitStatus = statusResult.stdout;
      status.hasUncommittedChanges = gitStatus.trim().length > 0;

      // Get remote URL
      try {
        const remoteResult = await execGit(['remote', 'get-url', 'origin'], {
          cwd: this.workingDirectory,
        });
        const remote = remoteResult.stdout;
        status.remoteUrl = remote.trim();
      } catch {
        // Remote might not be configured
      }

      return status;
    } catch (error) {
      logger.debug('Not a git repository');
      return status;
    }
  }

  /**
   * Creates a feature branch for the migration
   */
  async createFeatureBranch(branchName: string): Promise<string> {
    const status = await this.getGitStatus();

    if (!status.isGitRepo) {
      throw new Error('Not a git repository');
    }

    if (status.hasUncommittedChanges) {
      throw new Error('Uncommitted changes detected. Please commit or stash them first.');
    }

    // Create and checkout new branch
    try {
      // Validate branch name to prevent injection
      if (!validateBranchName(branchName)) {
        throw new Error('Invalid branch name: contains unsafe characters');
      }

      const result = await execGit(['checkout', '-b', branchName], {
        cwd: this.workingDirectory,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Failed to create branch: ${result.stderr}`);
      }
      logger.info(`Created and checked out branch: ${branchName}`);
      return branchName;
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        throw new Error(`Branch '${branchName}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Stages files for commit
   */
  async stageFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) {
      throw new Error('No files to stage');
    }

    // Stage files one by one to handle errors better
    for (const filePath of filePaths) {
      try {
        // Validate file path to prevent traversal
        if (!validateFilePath(filePath, this.workingDirectory)) {
          throw new Error(`Invalid file path: ${filePath}`);
        }

        const result = await execGit(['add', filePath], {
          cwd: this.workingDirectory,
        });

        if (result.exitCode !== 0) {
          throw new Error(`Failed to stage file: ${result.stderr}`);
        }
        logger.debug(`Staged: ${filePath}`);
      } catch (error) {
        logger.error(`Failed to stage file: ${filePath}`, error);
        throw new Error(`Failed to stage file: ${filePath}`);
      }
    }

    logger.info(`Staged ${filePaths.length} files`);
  }

  /**
   * Creates a commit with a descriptive message
   */
  async createCommit(message: string, description?: string): Promise<string> {
    const fullMessage = description ? `${message}\n\n${description}` : message;

    try {
      // Use secure commit with message via stdin
      const result = await gitCommitSecure(fullMessage, {
        cwd: this.workingDirectory,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Commit failed: ${result.stderr}`);
      }

      const { stdout } = result;

      // Extract commit hash
      const match = stdout.match(/\[[\w-]+ ([\w]+)\]/);
      const commitHash = match ? match[1] : 'unknown';

      logger.info(`Created commit: ${commitHash}`);
      return commitHash;
    } catch (error: any) {
      if (error.message.includes('nothing to commit')) {
        throw new Error('No changes to commit');
      }
      throw error;
    }
  }

  /**
   * Pushes the current branch to remote
   */
  async pushToRemote(branchName?: string): Promise<void> {
    const branch = branchName || (await this.getGitStatus()).currentBranch;

    if (!branch) {
      throw new Error('No branch specified and unable to determine current branch');
    }

    try {
      // Validate branch name
      if (!validateBranchName(branch)) {
        throw new Error('Invalid branch name for push');
      }

      const pushResult = await execGit(['push', '-u', 'origin', branch], {
        cwd: this.workingDirectory,
      });

      if (pushResult.exitCode !== 0) {
        throw new Error(`Push failed: ${pushResult.stderr}`);
      }
      logger.info(`Pushed branch '${branch}' to remote`);
    } catch (error: any) {
      if (error.message.includes('no upstream branch')) {
        // Try setting upstream
        // Validate branch name
        if (!validateBranchName(branch)) {
          throw new Error('Invalid branch name for push');
        }

        const pushResult = await execGit(['push', '--set-upstream', 'origin', branch], {
          cwd: this.workingDirectory,
        });

        if (pushResult.exitCode !== 0) {
          throw new Error(`Push failed: ${pushResult.stderr}`);
        }
        logger.info(`Pushed branch '${branch}' to remote with upstream`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Creates a pull request using GitHub CLI
   */
  async createPR(options: {
    title: string;
    body: string;
    base?: string;
    draft?: boolean;
    labels?: string[];
    assignees?: string[];
    reviewers?: string[];
  }): Promise<{
    number: number;
    url: string;
    title: string;
    body: string;
    baseRefName: string;
    headRefName: string;
  }> {
    // Check if authenticated
    const isAuthenticated = await this.validateGitHub();
    if (!isAuthenticated) {
      throw new Error('GitHub CLI not authenticated. Run "gh auth login" first.');
    }

    logger.info('Creating pull request...');

    // Build the command arguments safely
    const args = ['pr', 'create', '--title', options.title, '--body', options.body];

    if (options.base) {
      // Validate base branch name
      if (!validateBranchName(options.base)) {
        throw new Error('Invalid base branch name');
      }
      args.push('--base', options.base);
    }

    if (options.draft) {
      args.push('--draft');
    }

    if (options.labels && options.labels.length > 0) {
      args.push('--label', options.labels.join(','));
    }

    if (options.assignees && options.assignees.length > 0) {
      args.push('--assignee', options.assignees.join(','));
    }

    if (options.reviewers && options.reviewers.length > 0) {
      args.push('--reviewer', options.reviewers.join(','));
    }

    try {
      const result = await execGH(args, { cwd: this.workingDirectory });

      if (result.exitCode !== 0) {
        throw new Error(`PR creation failed: ${result.stderr}`);
      }

      const { stdout } = result;
      logger.info(`Pull request created: ${stdout.trim()}`);

      // Get PR details
      const prUrl = stdout.trim();
      const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];

      if (!prNumber) {
        throw new Error('Failed to extract PR number from URL');
      }

      // Fetch PR details using gh api
      const detailsResult = await execGH(
        ['pr', 'view', prNumber, '--json', 'number,url,title,body,baseRefName,headRefName'],
        { cwd: this.workingDirectory },
      );

      if (detailsResult.exitCode !== 0) {
        throw new Error(`Failed to fetch PR details: ${detailsResult.stderr}`);
      }

      const prDetails = JSON.parse(detailsResult.stdout);

      return prDetails;
    } catch (error: any) {
      logger.error('Failed to create PR:', error);
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
  }

  /**
   * Generates a detailed PR body from migration summary
   */
  generatePRBody(summary: MigrationSummary): string {
    const sections: string[] = [];

    sections.push('## GraphQL Schema Migration Summary');
    sections.push('');
    sections.push('This pull request contains automated GraphQL schema migration changes.');
    sections.push('');

    // Statistics
    sections.push('### Migration Statistics');
    sections.push(`- **Total files scanned**: ${summary.totalFiles}`);
    sections.push(`- **Total queries found**: ${summary.totalQueries}`);
    sections.push(`- **Queries transformed**: ${summary.transformedQueries}`);
    sections.push(`- **Deprecations fixed**: ${summary.deprecationsFixed}`);
    sections.push(`- **Files modified**: ${summary.filesModified.length}`);
    sections.push('');

    // Modified files
    if (summary.filesModified.length > 0) {
      sections.push('### Modified Files');
      summary.filesModified.forEach((file) => {
        sections.push(`- \`${file}\``);
      });
      sections.push('');
    }

    // Validation status
    sections.push('### Validation');
    sections.push(
      summary.validationPassed
        ? '✅ All transformations validated successfully'
        : '⚠️ Some validations require manual review',
    );
    sections.push('');

    // Review checklist
    sections.push('### Review Checklist');
    sections.push('- [ ] Verify GraphQL queries still function correctly');
    sections.push('- [ ] Check that all interpolations are preserved');
    sections.push('- [ ] Ensure no unintended changes were made');
    sections.push('- [ ] Run application tests');
    sections.push('');

    // Footer
    sections.push('---');
    sections.push('*Generated by pg-migration-620*');

    return sections.join('\n');
  }

  /**
   * Generates a branch name from the current date and optional prefix
   */
  generateBranchName(prefix: string = 'graphql-migration'): string {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const timestamp = Date.now().toString().slice(-4);
    return `${prefix}-${date}-${timestamp}`;
  }

  /**
   * Extracts PR number from GitHub URL
   */
  private extractPRNumber(url: string): string {
    const match = url.match(/\/pull\/(\d+)/);
    if (match) {
      return match[1];
    }
    // Sometimes gh returns just the URL without the full path
    const lastPart = url.split('/').pop();
    if (lastPart && /^\d+$/.test(lastPart)) {
      return lastPart;
    }
    throw new Error(`Unable to extract PR number from: ${url}`);
  }
}
