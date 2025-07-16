#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OperationAnalyzer } from '../core/analyzer/OperationAnalyzer.js';
import { logger } from '../utils/logger.js';
import { parse } from 'graphql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ExtractedQuery {
  id: string;
  file: string;
  name?: string;
  type: string;
  location: {
    line: number;
    column: number;
  };
  content: string;
}

interface ExtractedQueriesFile {
  timestamp: string;
  directory: string;
  totalQueries: number;
  queries: ExtractedQuery[];
}

function analyzeOperations() {
  try {
    // Load extracted queries
    const extractedQueriesPath = resolve(__dirname, '../../extracted-queries.json');
    const extractedData: ExtractedQueriesFile = JSON.parse(
      readFileSync(extractedQueriesPath, 'utf-8'),
    );

    logger.info(
      `Analyzing ${extractedData.totalQueries} operations from ${extractedData.directory}`,
    );

    // Prepare data for analyzer
    const operationsForAnalysis = extractedData.queries.map((query) => {
      let ast;
      try {
        ast = parse(query.content);
      } catch (error) {
        logger.warn(`Failed to parse AST for ${query.id}:`, error);
      }

      return {
        id: query.id,
        filePath: query.file,
        content: query.content,
        ast,
        name: query.name,
        type: query.type,
      };
    });

    // Analyze operations
    const analyzer = new OperationAnalyzer();
    const operationGroups = analyzer.analyzeOperations(operationsForAnalysis);
    const report = analyzer.generateOperationReport();
    const suggestedNames = analyzer.getSuggestedNames();

    // Generate detailed report
    console.log('\n' + '='.repeat(80));
    console.log('                    GraphQL Operation Analysis Report');
    console.log('='.repeat(80) + '\n');

    // Summary statistics
    console.log('📊 Summary Statistics');
    console.log('─'.repeat(40));
    console.log(`Total Operations:      ${report.totalOperations}`);
    console.log(`Unique Operations:     ${report.uniqueOperations}`);
    console.log(
      `Duplicate Rate:        ${(((report.totalOperations - report.uniqueOperations) / report.totalOperations) * 100).toFixed(1)}%`,
    );
    console.log(`Unnamed Operations:    ${report.unnamedOperations}`);
    console.log('');

    // Operations by type
    console.log('📋 Operations by Type');
    console.log('─'.repeat(40));
    console.log(`Queries:               ${report.operationsByType.query}`);
    console.log(`Mutations:             ${report.operationsByType.mutation}`);
    console.log(`Subscriptions:         ${report.operationsByType.subscription}`);
    console.log('');

    // Duplicate operations
    if (report.duplicateOperations.length > 0) {
      console.log('🔄 Duplicate Operations');
      console.log('─'.repeat(40));
      console.log(
        `Found ${report.duplicateOperations.length} operations with multiple variants:\n`,
      );

      report.duplicateOperations
        .sort((a, b) => b.variantCount - a.variantCount)
        .forEach((dup) => {
          console.log(`  • ${dup.name} (${dup.variantCount} variants)`);
          console.log(`    Files:`);
          dup.files.forEach((file) => {
            const shortPath = file.replace(/^.*\/data\/sample_data\//, 'data/sample_data/');
            console.log(`      - ${shortPath}`);
          });
          console.log('');
        });
    }

    // Fragment usage
    if (report.fragmentUsage.length > 0) {
      console.log('🧩 Fragment Usage');
      console.log('─'.repeat(40));
      console.log(`Found ${report.fragmentUsage.length} fragments in use:\n`);

      report.fragmentUsage.slice(0, 10).forEach((fragment) => {
        console.log(`  • ${fragment.fragment} (used in ${fragment.usageCount} operations)`);
        if (fragment.operations.length <= 3) {
          console.log(`    Operations: ${fragment.operations.join(', ')}`);
        } else {
          console.log(
            `    Operations: ${fragment.operations.slice(0, 3).join(', ')} + ${fragment.operations.length - 3} more`,
          );
        }
        console.log('');
      });

      if (report.fragmentUsage.length > 10) {
        console.log(`  ... and ${report.fragmentUsage.length - 10} more fragments\n`);
      }
    }

    // Suggested names for unnamed operations
    if (suggestedNames.size > 0) {
      console.log('💡 Suggested Names for Unnamed Operations');
      console.log('─'.repeat(40));

      for (const [currentName, suggestedName] of suggestedNames) {
        const group = operationGroups.get(currentName);
        if (group) {
          console.log(`\n  • ${currentName} → ${suggestedName}`);
          console.log(`    Type: ${group.type}`);
          console.log(
            `    Main selections: ${group.commonSelections
              .filter((s) => !s.startsWith('...'))
              .slice(0, 5)
              .join(', ')}`,
          );
          console.log(`    Files:`);
          [...new Set(group.variants.map((v) => v.filePath))].forEach((file) => {
            const shortPath = file.replace(/^.*\/data\/sample_data\//, 'data/sample_data/');
            console.log(`      - ${shortPath}`);
          });
        }
      }
      console.log('');
    }

    // Detailed operation groups
    console.log('📁 Detailed Operation Groups');
    console.log('─'.repeat(40));
    console.log(`Showing details for operations with multiple variants:\n`);

    let detailCount = 0;
    for (const [name, group] of operationGroups) {
      if (group.variants.length > 1 && detailCount < 5) {
        console.log(`  ${name} (${group.type})`);
        console.log(`  └─ Variants: ${group.variants.length}`);
        console.log(`  └─ Common variables: ${group.commonVariables.join(', ') || 'none'}`);
        console.log(
          `  └─ Common selections: ${group.commonSelections.slice(0, 5).join(', ')}${group.commonSelections.length > 5 ? ' ...' : ''}`,
        );
        console.log(
          `  └─ Differing selections: ${group.differingSelections.slice(0, 3).join(', ')}${group.differingSelections.length > 3 ? ' ...' : ''}`,
        );
        console.log('');
        detailCount++;
      }
    }

    if (
      detailCount < Array.from(operationGroups.values()).filter((g) => g.variants.length > 1).length
    ) {
      console.log(
        `  ... and ${Array.from(operationGroups.values()).filter((g) => g.variants.length > 1).length - detailCount} more groups with variants\n`,
      );
    }

    // Recommendations
    console.log('💭 Recommendations');
    console.log('─'.repeat(40));
    console.log('1. Review duplicate operations for consolidation opportunities');
    console.log('2. Consider naming all unnamed operations for better maintainability');
    console.log('3. Examine operations with many variants for potential standardization');
    console.log('4. Review fragment usage to ensure consistent patterns');

    if (report.duplicateOperations.length > 5) {
      console.log(
        `5. High duplication detected (${report.duplicateOperations.length} duplicates) - consider creating a shared queries module`,
      );
    }

    console.log('\n' + '='.repeat(80) + '\n');

    logger.info('Operation analysis completed successfully');
  } catch (error) {
    logger.error('Failed to analyze operations:', error);
    process.exit(1);
  }
}

// Run the analyzer
analyzeOperations();
