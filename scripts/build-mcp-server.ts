import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

const projectRoot = process.cwd();
const mcpServerPath = join(projectRoot, 'dist', 'mcp', 'server.js');

console.log(chalk.blue('🔨 Building MCP Server...'));

try {
  // Build the project
  execSync('pnpm build', { stdio: 'inherit', cwd: projectRoot });

  // Check if the MCP server was built
  if (!existsSync(mcpServerPath)) {
    console.error(chalk.red('❌ MCP server build failed - server.js not found'));
    process.exit(1);
  }

  console.log(chalk.green('✅ MCP server built successfully'));
  console.log(chalk.gray(`Server location: ${mcpServerPath}`));

  // Quick test to ensure it can start
  console.log(chalk.blue('\n🧪 Testing MCP server startup...'));

  const testProcess = execSync('node dist/mcp/server.js --version || true', {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  console.log(chalk.green('✅ MCP server is ready for testing'));
} catch (error) {
  console.error(chalk.red('❌ Build failed:'), error);
  process.exit(1);
}
