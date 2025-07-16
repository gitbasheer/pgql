/**
 * Generates PR metadata and descriptions
 * Single responsibility: Create PR-ready content from transformation results
 */

import { TransformResult } from '../BaseTransformer.js';

export interface PRMetadata {
  title: string;
  description: string;
  labels: string[];
  breaking: boolean;
  affectedQueries: number;
  estimatedImpact: 'low' | 'medium' | 'high';
}

export class PRMetadataGenerator {
  /**
   * Generate PR metadata from transformation results
   */
  generateMetadata(results: TransformResult[]): PRMetadata {
    const totalChanges = results.reduce((sum, r) => sum + r.changes.length, 0);
    const breakingChanges = results.flatMap(r => 
      r.changes.filter(c => c.impact === 'BREAKING')
    );
    
    const hasBreaking = breakingChanges.length > 0;
    const impact = this.calculateImpact(totalChanges, breakingChanges.length);
    
    return {
      title: this.generateTitle(results.length, hasBreaking),
      description: this.generateDescription(results, breakingChanges),
      labels: this.generateLabels(hasBreaking, impact),
      breaking: hasBreaking,
      affectedQueries: results.length,
      estimatedImpact: impact,
    };
  }

  private generateTitle(queryCount: number, hasBreaking: boolean): string {
    const prefix = hasBreaking ? '🚨 BREAKING:' : '✨';
    return `${prefix} Update ${queryCount} GraphQL ${queryCount === 1 ? 'query' : 'queries'} for schema migration`;
  }

  private generateDescription(
    results: TransformResult[],
    breakingChanges: any[]
  ): string {
    let description = '## GraphQL Schema Migration\n\n';
    
    // Summary
    description += '### Summary\n';
    description += `- **Queries Updated**: ${results.length}\n`;
    description += `- **Total Changes**: ${results.reduce((sum, r) => sum + r.changes.length, 0)}\n`;
    description += `- **Breaking Changes**: ${breakingChanges.length}\n`;
    description += `- **Average Confidence**: ${this.calculateAverageConfidence(results)}%\n\n`;
    
    // Breaking changes section
    if (breakingChanges.length > 0) {
      description += '### ⚠️ Breaking Changes\n';
      for (const change of breakingChanges) {
        description += `- **${change.path}**: ${change.oldValue} → ${change.newValue} (${change.reason})\n`;
      }
      description += '\n';
    }
    
    // Changes by query
    description += '### Changes by Query\n';
    for (const result of results) {
      description += `\n#### ${result.queryId}\n`;
      description += `- **Changes**: ${result.changes.length}\n`;
      description += `- **Confidence**: ${result.confidence}%\n`;
      
      if (result.warnings.length > 0) {
        description += `- **Warnings**: ${result.warnings.length}\n`;
      }
    }
    
    // Migration notes
    description += '\n### Migration Notes\n';
    description += '- All queries have been validated against the new schema\n';
    description += '- Mapping utilities have been generated for response compatibility\n';
    description += '- Please review changes carefully before merging\n';
    
    // Testing checklist
    description += '\n### Testing Checklist\n';
    description += '- [ ] Run integration tests\n';
    description += '- [ ] Test with sample data\n';
    description += '- [ ] Verify response mappings\n';
    description += '- [ ] Check performance impact\n';
    
    return description;
  }

  private generateLabels(hasBreaking: boolean, impact: string): string[] {
    const labels = ['graphql', 'schema-migration', 'automated'];
    
    if (hasBreaking) {
      labels.push('breaking-change');
    }
    
    labels.push(`impact:${impact}`);
    
    return labels;
  }

  private calculateImpact(totalChanges: number, breakingChanges: number): 'low' | 'medium' | 'high' {
    if (breakingChanges > 0 || totalChanges > 50) {
      return 'high';
    }
    if (totalChanges > 10) {
      return 'medium';
    }
    return 'low';
  }

  private calculateAverageConfidence(results: TransformResult[]): number {
    if (results.length === 0) return 0;
    const sum = results.reduce((total, r) => total + r.confidence, 0);
    return Math.round(sum / results.length);
  }

  /**
   * Generate commit message
   */
  generateCommitMessage(metadata: PRMetadata): string {
    const emoji = metadata.breaking ? '🚨' : '✨';
    return `${emoji} Update ${metadata.affectedQueries} GraphQL queries for schema migration`;
  }
}