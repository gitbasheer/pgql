import * as fs from 'fs/promises';
import * as path from 'path';
import { ExtractionResult } from '../types/index.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';
import { logger } from '../../../utils/logger.js';
import { validateWritePath, sanitizeFileName } from '../../../utils/securePath.js';

export class FileReporter {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async generate(result: ExtractionResult): Promise<void> {
    // SECURITY FIX: Validate output directory to prevent path traversal
    const baseOutputDir = this.context.options.outputDir || '.';
    const validatedBase = validateWritePath(baseOutputDir, 'extracted-queries');
    if (!validatedBase) {
      throw new Error(`Invalid output directory: ${baseOutputDir}`);
    }
    
    // Create directories
    await fs.mkdir(validatedBase, { recursive: true });
    
    // Write queries
    const queriesDir = validateWritePath(validatedBase, 'queries');
    if (!queriesDir) {
      throw new Error('Invalid queries directory path');
    }
    await fs.mkdir(queriesDir, { recursive: true });
    
    for (const query of result.queries) {
      // SECURITY FIX: Sanitize file names to prevent path injection
      const safeName = sanitizeFileName(query.name || query.id);
      const fileName = this.generateFileName(safeName, 'graphql');
      const filePath = validateWritePath(queriesDir, fileName);
      
      if (!filePath) {
        logger.warn(`Skipping query with unsafe filename: ${query.name || query.id}`);
        continue;
      }
      
      await fs.writeFile(filePath, query.resolvedContent);
    }
    
    logger.info(`Wrote ${result.queries.length} queries to ${queriesDir}`);
    
    // Write variants if any
    if (result.variants.length > 0) {
      const variantsDir = validateWritePath(validatedBase, 'variants');
      if (!variantsDir) {
        logger.warn('Invalid variants directory path');
        return;
      }
      await fs.mkdir(variantsDir, { recursive: true });
      
      for (const variant of result.variants) {
        const conditionStr = this.formatConditions(variant.conditions);
        const safeVariantName = sanitizeFileName(`${variant.queryName}_${conditionStr}`);
        const fileName = this.generateFileName(safeVariantName, 'graphql');
        const filePath = validateWritePath(variantsDir, fileName);
        
        if (!filePath) {
          logger.warn(`Skipping variant with unsafe filename: ${variant.queryName}`);
          continue;
        }
        
        await fs.writeFile(filePath, variant.content);
      }
      
      logger.info(`Wrote ${result.variants.length} variants to ${variantsDir}`);
    }
    
    // Write fragments
    if (result.fragments.size > 0) {
      const fragmentsDir = validateWritePath(validatedBase, 'fragments');
      if (!fragmentsDir) {
        logger.warn('Invalid fragments directory path');
        return;
      }
      await fs.mkdir(fragmentsDir, { recursive: true });
      
      for (const [name, content] of result.fragments) {
        const safeName = sanitizeFileName(name);
        const fileName = this.generateFileName(safeName, 'graphql');
        const filePath = validateWritePath(fragmentsDir, fileName);
        
        if (!filePath) {
          logger.warn(`Skipping fragment with unsafe filename: ${name}`);
          continue;
        }
        
        await fs.writeFile(filePath, content);
      }
      
      logger.info(`Wrote ${result.fragments.size} fragments to ${fragmentsDir}`);
    }
    
    // Write index file
    await this.writeIndexFile(validatedBase, result);
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