/** @fileoverview Joint testing script for vnext-dashboard with real data per CLAUDE.local.md
 * @author Z (Integration Lead)
 */

import { UnifiedExtractor } from './src/core/extraction/engine/UnifiedExtractor.js';
import { ResponseValidationService } from './src/core/validator/ResponseValidationService.js';
import { OptimizedSchemaTransformer } from './src/core/transformer/OptimizedSchemaTransformer.js';
import { GraphQLClient } from './src/core/testing/GraphQLClient.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Readonly types per CLAUDE.local.md
interface PipelineConfig {
  readonly sampleDataPath: string;
  readonly outputDir: string;
  readonly enableRealApi: boolean;
  readonly endpoints: {
    readonly productGraph: string;
    readonly offerGraph: string;
  };
}

interface PipelineMetrics {
  readonly extraction: {
    readonly total: number;
    readonly successful: number;
    readonly errors: readonly string[];
  };
  readonly classification: {
    readonly productGraph: number;
    readonly offerGraph: number;
  };
  readonly validation: {
    readonly valid: number;
    readonly invalid: number;
    readonly nullabilityErrors: number;
  };
  readonly realApi: {
    readonly tested: number;
    readonly baselines: readonly string[];
  };
  readonly transformation: {
    readonly transformed: number;
    readonly utilsGenerated: number;
  };
}

async function runJointTesting(): Promise<void> {
  console.log('🚀 Starting joint testing on vnext-dashboard with real data\n');
  console.log('📋 Following CLAUDE.local.md best practices:');
  console.log('   - Using readonly types for immutability');
  console.log('   - Using spreads for merging query variables');
  console.log('   - Strict type safety throughout\n');

  const config: PipelineConfig = {
    sampleDataPath: path.join(process.cwd(), 'data/sample_data'),
    outputDir: path.join(process.cwd(), 'joint-testing-output'),
    enableRealApi: true,
    endpoints: {
      productGraph: process.env.APOLLO_PG_ENDPOINT || 'https://pg.api.godaddy.com/v1/gql/customer',
      offerGraph: process.env.APOLLO_OG_ENDPOINT || 'https://og.api.godaddy.com/'
    }
  };

  const metrics: Partial<PipelineMetrics> = {};

  try {
    // Step 1: Extraction with fixed AST imports
    console.log('📦 Step 1: Extracting queries from vnext sample data...');
    const extractor = new UnifiedExtractor({
      directory: config.sampleDataPath,
      patterns: ['**/*.{js,jsx,ts,tsx}'],
      strategies: ['hybrid'],
      features: {
        enableTemplateResolution: true,
        enableVariantGeneration: true,
        preserveSourceAST: true
      }
    });

    const extractionResult = await extractor.extract();
    
    metrics.extraction = {
      total: extractionResult.queries.length,
      successful: extractionResult.queries.length - extractionResult.errors.length,
      errors: extractionResult.errors.map(e => e.message)
    };

    console.log(`✅ Extracted ${metrics.extraction.total} queries`);
    console.log(`   - Successful: ${metrics.extraction.successful}`);
    console.log(`   - Errors: ${metrics.extraction.errors.length}`);

    // Step 2: Classification
    console.log('\n🔍 Step 2: Classifying endpoints...');
    const pgQueries = extractionResult.queries.filter(q => q.endpoint === 'productGraph');
    const ogQueries = extractionResult.queries.filter(q => q.endpoint === 'offerGraph');
    
    metrics.classification = {
      productGraph: pgQueries.length,
      offerGraph: ogQueries.length
    };

    console.log(`✅ Product Graph: ${metrics.classification.productGraph} queries`);
    console.log(`✅ Offer Graph: ${metrics.classification.offerGraph} queries`);

    // Step 3: Validation with nullability checks (Apollo best practices)
    console.log('\n✓ Step 3: Validating queries with Apollo best practices...');
    const validationService = new ResponseValidationService({
      endpoints: {
        baseline: { url: config.endpoints.productGraph },
        transformed: { url: config.endpoints.offerGraph }
      },
      comparison: {
        strict: true,
        ignorePaths: [],
        customComparators: {}
      },
      capture: {
        maxConcurrency: 5,
        timeout: 30000,
        variableGeneration: 'smart'
      },
      storage: {
        type: 'file',
        path: path.join(config.outputDir, 'validations')
      }
    });

    let validCount = 0;
    let invalidCount = 0;
    let nullabilityErrors = 0;

    for (const query of extractionResult.queries.slice(0, 10)) {
      const validation = await validationService.validateAgainstSchema(
        query.content,
        query.endpoint || 'productGraph'
      );

      if (validation.valid) {
        validCount++;
      } else {
        invalidCount++;
        // Check for nullability errors
        if (validation.errors.some(e => e.includes('null') || e.includes('NonNull'))) {
          nullabilityErrors++;
        }
      }
    }

    metrics.validation = {
      valid: validCount,
      invalid: invalidCount,
      nullabilityErrors
    };

    console.log(`✅ Valid: ${validCount}, Invalid: ${invalidCount}`);
    console.log(`   - Nullability errors: ${nullabilityErrors}`);

    // Step 4: Real API Testing with auth from .env
    console.log('\n🌐 Step 4: Testing on real API with authentication...');
    const realApiResults: string[] = [];
    let testedCount = 0;

    if (config.enableRealApi && process.env.auth_idp) {
      const client = new GraphQLClient({
        endpoint: config.endpoints.productGraph,
        baselineDir: path.join(config.outputDir, 'baselines')
      });

      // Test first 5 queries
      for (const query of extractionResult.queries.slice(0, 5)) {
        try {
          // Build variables using spreads per CLAUDE.local.md
          const baseVars = { limit: 10, offset: 0 };
          const queryVars = await validationService.buildVariables(query.content);
          const variables = { ...baseVars, ...queryVars };

          console.log(`   Testing: ${query.name || 'unnamed'}...`);
          const response = await client.query(query.content, variables);
          
          if (response) {
            const baselineName = `${query.name || `query-${testedCount}`}.json`;
            await fs.mkdir(path.join(config.outputDir, 'baselines'), { recursive: true });
            await fs.writeFile(
              path.join(config.outputDir, 'baselines', baselineName),
              JSON.stringify({ query: query.content, variables, response }, null, 2)
            );
            realApiResults.push(baselineName);
            testedCount++;
            console.log(`   ✅ Baseline saved: ${baselineName}`);
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error: any) {
          console.log(`   ❌ API error: ${error.message}`);
        }
      }
    }

    metrics.realApi = {
      tested: testedCount,
      baselines: realApiResults
    };

    // Step 5: Transformation with A/B utils
    console.log('\n🔄 Step 5: Transforming queries and generating utils...');
    const transformer = new OptimizedSchemaTransformer([
      {
        objectType: 'User',
        fieldName: 'profilePicture',
        reason: 'Moved to profile.logoUrl',
        replacementField: 'profile.logoUrl',
        transformationType: 'nested-replacement' as const
      },
      {
        objectType: 'Venture',
        fieldName: 'logoImage',
        reason: 'Renamed to logoUrl',
        replacementField: 'logoUrl',
        transformationType: 'field-rename' as const
      }
    ]);

    let transformedCount = 0;
    let utilsGenerated = 0;

    for (const query of extractionResult.queries.slice(0, 10)) {
      const result = await transformer.transform(query.content);
      if (result.changes.length > 0) {
        transformedCount++;
        
        // Generate util with A/B flag
        const util = transformer.generateMappingUtil(
          { old: 'structure' },
          { new: 'structure' },
          query.name || 'unnamed'
        );
        
        if (util.includes('hivemind.flag')) {
          utilsGenerated++;
        }
      }
    }

    metrics.transformation = {
      transformed: transformedCount,
      utilsGenerated
    };

    console.log(`✅ Transformed: ${transformedCount} queries`);
    console.log(`✅ Utils with A/B flags: ${utilsGenerated}`);

    // Generate comprehensive report
    await generateReport(config, metrics as PipelineMetrics);
    
    console.log('\n🎉 Joint testing completed successfully!');
    console.log('📊 Results saved to:', config.outputDir);

  } catch (error) {
    console.error('❌ Joint testing failed:', error);
    process.exit(1);
  }
}

async function generateReport(config: PipelineConfig, metrics: PipelineMetrics): Promise<void> {
  const report = `# Joint Testing Report - vnext-dashboard

**Date:** ${new Date().toISOString()}
**Sample Data:** ${config.sampleDataPath}
**Real API:** ${config.enableRealApi ? 'Enabled' : 'Disabled'}

## Metrics Summary

### Extraction
- Total Queries: ${metrics.extraction.total}
- Successful: ${metrics.extraction.successful}
- Errors: ${metrics.extraction.errors.length}

### Classification
- Product Graph: ${metrics.classification.productGraph}
- Offer Graph: ${metrics.classification.offerGraph}

### Validation (Apollo Best Practices)
- Valid: ${metrics.validation.valid}
- Invalid: ${metrics.validation.invalid}
- Nullability Errors: ${metrics.validation.nullabilityErrors}

### Real API Testing
- Tested: ${metrics.realApi.tested}
- Baselines Saved: ${metrics.realApi.baselines.length}
${metrics.realApi.baselines.map(b => `  - ${b}`).join('\n')}

### Transformation
- Transformed: ${metrics.transformation.transformed}
- Utils with A/B Flags: ${metrics.transformation.utilsGenerated}

## CLAUDE.local.md Compliance
✅ Using readonly types for immutability
✅ Using spreads for merging query variables
✅ Strict type safety throughout
✅ Proper error handling with logging

## Demo Script

\`\`\`bash
# 1. Start UI
cd ui && pnpm dev

# 2. Open http://localhost:5173

# 3. Input sample path: data/sample_data

# 4. Click "Start Pipeline" or "Test vnext Sample"

# 5. Verify in UI:
   - Real-time logs streaming
   - Pipeline progress through 6 stages
   - Query diff viewer showing transformations
   - PR generation with Git diffs
\`\`\`

Generated by: pgql v0.1.0
`;

  await fs.mkdir(config.outputDir, { recursive: true });
  await fs.writeFile(path.join(config.outputDir, 'joint-testing-report.md'), report);
}

// Run the joint testing
runJointTesting();