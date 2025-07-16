import * as fs from 'fs/promises';
import * as path from 'path';
import { ExtractionResult } from '../types/index.js';
import { ExtractionContext } from '../engine/ExtractionContext.js';
import { logger } from '../../../utils/logger.js';
import { validateWritePath } from '../../../utils/securePath.js';

export class JSONReporter {
  private context: ExtractionContext;

  constructor(context: ExtractionContext) {
    this.context = context;
  }

  async generate(result: ExtractionResult): Promise<void> {
    // SECURITY FIX: Validate output path to prevent traversal
    const outputDir = this.context.options.outputDir || '.';
    const outputPath = validateWritePath(outputDir, 'extraction-result.json');

    if (!outputPath) {
      throw new Error(`Invalid output path for JSON report: ${outputDir}`);
    }

    // Prepare the output
    const output = {
      metadata: {
        extractedAt: new Date().toISOString(),
        directory: this.context.options.directory,
        options: this.context.options,
        stats: result.stats,
      },
      queries: result.queries.map((q) => ({
        id: q.id,
        name: q.name,
        originalName: q.originalName,
        type: q.type,
        filePath: q.filePath,
        location: q.location,
        content: q.resolvedContent,
        fragments: q.resolvedFragments?.map((f) => f.name) || [],
        context: q.context,
        variables: q.variables,
      })),
      variants: result.variants.map((v) => ({
        id: v.id,
        originalQueryId: v.originalQueryId,
        queryName: v.queryName,
        conditions: v.conditions,
        content: v.content,
        usedFragments: v.usedFragments,
      })),
      fragments: Object.fromEntries(result.fragments),
      switches: Object.fromEntries(
        Array.from(result.switches.entries()).map(([key, value]) => [
          key,
          {
            ...value,
            variable: key,
          },
        ]),
      ),
      errors: result.errors,
    };

    // Write the output
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

    logger.info(`JSON report written to ${outputPath}`);
  }
}
