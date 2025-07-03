import * as fs from 'fs/promises';
import * as path from 'path';
import { ExtractionResult } from '../types/index';
import { ExtractionContext } from '../engine/ExtractionContext';
import { logger } from '../../../utils/logger';

export class FileReporter {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async generate(result: ExtractionResult): Promise<void> {
    const outputDir = path.join(this.context.options.outputDir || '.', 'extracted-queries');
    
    // Create directories
    await fs.mkdir(outputDir, { recursive: true });
    
    // Write queries
    const queriesDir = path.join(outputDir, 'queries');
    await fs.mkdir(queriesDir, { recursive: true });
    
    for (const query of result.queries) {
      const fileName = this.generateFileName(query.name || query.id, 'graphql');
      const filePath = path.join(queriesDir, fileName);
      
      await fs.writeFile(filePath, query.resolvedContent);
    }
    
    logger.info(`Wrote ${result.queries.length} queries to ${queriesDir}`);
    
    // Write variants if any
    if (result.variants.length > 0) {
      const variantsDir = path.join(outputDir, 'variants');
      await fs.mkdir(variantsDir, { recursive: true });
      
      for (const variant of result.variants) {
        const conditionStr = this.formatConditions(variant.conditions);
        const fileName = this.generateFileName(
          `${variant.queryName}_${conditionStr}`,
          'graphql'
        );
        const filePath = path.join(variantsDir, fileName);
        
        await fs.writeFile(filePath, variant.content);
      }
      
      logger.info(`Wrote ${result.variants.length} variants to ${variantsDir}`);
    }
    
    // Write fragments
    if (result.fragments.size > 0) {
      const fragmentsDir = path.join(outputDir, 'fragments');
      await fs.mkdir(fragmentsDir, { recursive: true });
      
      for (const [name, content] of result.fragments) {
        const fileName = this.generateFileName(name, 'graphql');
        const filePath = path.join(fragmentsDir, fileName);
        
        await fs.writeFile(filePath, content);
      }
      
      logger.info(`Wrote ${result.fragments.size} fragments to ${fragmentsDir}`);
    }
    
    // Write index file
    await this.writeIndexFile(outputDir, result);
  }

  private generateFileName(name: string, extension: string): string {
    // Sanitize filename
    const sanitized = name
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    return `${sanitized}.${extension}`;
  }

  private formatConditions(conditions: any): string {
    const switches = conditions.switches || {};
    return Object.entries(switches)
      .map(([key, value]) => `${key}_${value}`)
      .join('_');
  }

  private async writeIndexFile(outputDir: string, result: ExtractionResult): Promise<void> {
    const indexPath = path.join(outputDir, 'index.md');
    
    const content = `# Extracted GraphQL Operations

## Summary
- Total Queries: ${result.stats.totalQueries}
- Total Variants: ${result.stats.totalVariants}
- Total Fragments: ${result.stats.totalFragments}
- Extraction Duration: ${result.stats.duration}ms

## Queries
${result.queries.map(q => `- ${q.name || q.id} (${q.type})`).join('\n')}

${result.variants.length > 0 ? `## Variants
${result.variants.map(v => `- ${v.queryName} - ${v.conditions.description || 'variant'}`).join('\n')}` : ''}

${result.fragments.size > 0 ? `## Fragments
${Array.from(result.fragments.keys()).map(name => `- ${name}`).join('\n')}` : ''}

${result.errors.length > 0 ? `## Errors
${result.errors.map(e => `- ${e.file}: ${e.message}`).join('\n')}` : ''}
`;
    
    await fs.writeFile(indexPath, content);
    logger.info(`Index file written to ${indexPath}`);
  }
}