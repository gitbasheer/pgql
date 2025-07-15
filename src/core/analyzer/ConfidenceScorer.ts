import { GraphQLOperation, CodeChange, ConfidenceScore, ConfidenceFactors } from '../../types';
import { logger } from '../../utils/logger.js';

export class ConfidenceScorer {
  private readonly thresholds = {
    automatic: 90,
    semiAutomatic: 70,
    manual: 0
  };

  scoreTransformation(change: CodeChange): ConfidenceScore {
    const factors = this.calculateFactors(change);
    const score = this.calculateScore(factors);
    
    return {
      score,
      category: this.categorize(score),
      factors,
      risks: this.identifyRisks(change, factors),
      requiresReview: score < this.thresholds.automatic
    };
  }

  private calculateFactors(change: CodeChange): ConfidenceFactors {
    return {
      complexity: this.analyzeComplexity(change.operation),
      patternMatch: this.analyzePatternMatch(change),
      testCoverage: this.analyzeTestCoverage(change.file),
      historicalSuccess: this.getHistoricalSuccess(change.pattern)
    };
  }

  private calculateScore(factors: ConfidenceFactors): number {
    // Weighted average of factors
    const weights = {
      complexity: 0.3,
      patternMatch: 0.3,
      testCoverage: 0.2,
      historicalSuccess: 0.2
    };

    const score = Object.entries(factors).reduce((total, [key, value]) => {
      return total + (value * weights[key as keyof ConfidenceFactors]);
    }, 0);

    return Math.round(score);
  }

  private categorize(score: number): 'automatic' | 'semi-automatic' | 'manual' {
    if (score >= this.thresholds.automatic) return 'automatic';
    if (score >= this.thresholds.semiAutomatic) return 'semi-automatic';
    return 'manual';
  }

  private analyzeComplexity(operation: GraphQLOperation): number {
    // Simple complexity analysis based on query depth and field count
    let complexity = 100;
    
    // Reduce score for deep nesting
    const depth = this.calculateDepth(operation.ast);
    if (depth > 5) complexity -= (depth - 5) * 10;
    
    // Reduce score for many fields
    const fieldCount = this.countFields(operation.ast);
    if (fieldCount > 20) complexity -= (fieldCount - 20) * 2;
    
    // Reduce score for fragments
    if (operation.fragments.length > 3) {
      complexity -= operation.fragments.length * 5;
    }
    
    return Math.max(0, Math.min(100, complexity));
  }

  private analyzePatternMatch(change: CodeChange): number {
    // Check if the transformation matches known patterns
    const knownPatterns = [
      'simple-field-rename',
      'root-query-migration',
      'connection-to-array',
      'deprecated-field-removal'
    ];
    
    if (knownPatterns.includes(change.pattern)) {
      return 95;
    }
    
    // Partial matches get lower scores
    if (change.pattern.includes('custom')) {
      return 60;
    }
    
    return 40;
  }

  private analyzeTestCoverage(filePath: string): number {
    // In a real implementation, this would check actual test coverage
    // For now, return a moderate score
    logger.debug(`Checking test coverage for ${filePath}`);
    return 75;
  }

  private getHistoricalSuccess(pattern: string): number {
    // In a real implementation, this would check historical data
    // For now, return based on pattern type
    const successRates: Record<string, number> = {
      'simple-field-rename': 98,
      'root-query-migration': 90,
      'connection-to-array': 85,
      'deprecated-field-removal': 95,
      'custom': 70
    };
    
    return successRates[pattern] || 50;
  }

  private identifyRisks(change: CodeChange, factors: ConfidenceFactors): string[] {
    const risks: string[] = [];
    
    if (factors.complexity < 70) {
      risks.push('High query complexity may lead to performance issues');
    }
    
    if (factors.testCoverage < 60) {
      risks.push('Low test coverage increases risk of undetected issues');
    }
    
    if (factors.patternMatch < 80) {
      risks.push('Non-standard pattern may require manual verification');
    }
    
    if (change.operation.fragments.length > 5) {
      risks.push('Multiple fragments increase transformation complexity');
    }
    
    return risks;
  }

  private calculateDepth(ast: any): number {
    // Simplified depth calculation
    // In real implementation, would traverse the AST properly
    return 3;
  }

  private countFields(ast: any): number {
    // Simplified field count
    // In real implementation, would count all selection sets
    return 10;
  }
}