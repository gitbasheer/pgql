import { parse, print, DocumentNode, visit } from 'graphql';
import * as t from '@babel/types';
import { logger } from '../../utils/logger';

export interface GraphQLChangeMap {
  additions: Map<number, string>;
  deletions: Map<number, number>;
  replacements: Map<number, { length: number; newText: string }>;
}

export class MinimalChangeCalculator {
  /**
   * Calculate minimal changes between two GraphQL queries
   */
  calculateGraphQLChanges(original: string, transformed: string): GraphQLChangeMap {
    const changeMap: GraphQLChangeMap = {
      additions: new Map(),
      deletions: new Map(),
      replacements: new Map()
    };

    try {
      // Parse both queries to compare their ASTs
      const originalAst = parse(original);
      const transformedAst = parse(transformed);

      // Calculate differences at the AST level
      this.calculateASTDifferences(originalAst, transformedAst, changeMap);
    } catch (error) {
      logger.warn('Failed to parse GraphQL for AST diff, falling back to text diff');
      // Fallback to simple text diff if AST parsing fails
      this.calculateTextDifferences(original, transformed, changeMap);
    }

    return changeMap;
  }

  /**
   * Apply calculated changes to template literal quasis
   */
  applyChangesToQuasis(
    originalQuasis: any[],
    changeMap: GraphQLChangeMap
  ): any[] {
    // First, let's understand that quasis don't contain interpolations
    // They are the text segments between interpolations
    // For example: `query ${a} { user(id: ${b}) }` has quasis: ["query ", " { user(id: ", ") }"]
    
    // Reconstruct the full content with proper interpolation tracking
    let fullContent = '';
    const segments: { content: string; isInterpolation: boolean; quasiIndex?: number }[] = [];
    
    for (let i = 0; i < originalQuasis.length; i++) {
      segments.push({ 
        content: originalQuasis[i].value.raw, 
        isInterpolation: false,
        quasiIndex: i
      });
      fullContent += originalQuasis[i].value.raw;
      
      if (i < originalQuasis.length - 1) {
        segments.push({ content: '${...}', isInterpolation: true });
        fullContent += '${...}'; // Placeholder for interpolation
      }
    }

    // Apply changes to the full content
    let modifiedContent = fullContent;
    
    // Sort changes by position in reverse order to avoid position shifts
    const allChanges: Array<{ position: number; type: string; value: any }> = [];
    
    for (const [pos, length] of changeMap.deletions) {
      allChanges.push({ position: pos, type: 'delete', value: length });
    }
    
    for (const [pos, text] of changeMap.additions) {
      allChanges.push({ position: pos, type: 'add', value: text });
    }
    
    for (const [pos, replacement] of changeMap.replacements) {
      allChanges.push({ position: pos, type: 'replace', value: replacement });
    }
    
    // Sort by position (descending to avoid position shifts)
    allChanges.sort((a, b) => b.position - a.position);
    
    // Apply changes
    for (const change of allChanges) {
      if (change.type === 'delete') {
        modifiedContent = 
          modifiedContent.slice(0, change.position) +
          modifiedContent.slice(change.position + change.value);
      } else if (change.type === 'add') {
        modifiedContent = 
          modifiedContent.slice(0, change.position) +
          change.value +
          modifiedContent.slice(change.position);
      } else if (change.type === 'replace') {
        modifiedContent = 
          modifiedContent.slice(0, change.position) +
          change.value.newText +
          modifiedContent.slice(change.position + change.value.length);
      }
    }
    
    // Now split the modified content back into quasis
    // We need to find where the interpolations (${...}) are and split around them
    const newQuasis = [];
    const interpolationRegex = /\$\{\.\.\.}/g;
    let lastIndex = 0;
    let match;
    let quasiIndex = 0;
    
    while ((match = interpolationRegex.exec(modifiedContent)) !== null) {
      // Add the content before this interpolation
      const quasiContent = modifiedContent.slice(lastIndex, match.index);
      const isLast = false;
      
      newQuasis.push(t.templateElement({
        raw: quasiContent,
        cooked: this.cookString(quasiContent)
      }, isLast));
      
      lastIndex = match.index + match[0].length;
      quasiIndex++;
    }
    
    // Add the final quasi (after the last interpolation or the whole string if no interpolations)
    const finalQuasiContent = modifiedContent.slice(lastIndex);
    const isLast = true;
    
    newQuasis.push(t.templateElement({
      raw: finalQuasiContent,
      cooked: this.cookString(finalQuasiContent)
    }, isLast));
    
    return newQuasis;
  }

  /**
   * Calculate differences between two GraphQL ASTs
   */
  private calculateASTDifferences(
    originalAst: DocumentNode,
    transformedAst: DocumentNode,
    changeMap: GraphQLChangeMap
  ): void {
    const originalStr = print(originalAst);
    const transformedStr = print(transformedAst);

    // For now, use a simple approach - this can be enhanced with more sophisticated AST diffing
    this.calculateTextDifferences(originalStr, transformedStr, changeMap);
  }

  /**
   * Calculate text-based differences
   */
  private calculateTextDifferences(
    original: string,
    transformed: string,
    changeMap: GraphQLChangeMap
  ): void {
    // Use word-based diff for better results
    const originalWords = this.tokenizeGraphQL(original);
    const transformedWords = this.tokenizeGraphQL(transformed);
    
    // Calculate word-level LCS
    const lcs = this.longestCommonSubsequenceWords(originalWords, transformedWords);
    
    let origIdx = 0;
    let transIdx = 0;
    let lcsIdx = 0;
    let charPos = 0;

    while (origIdx < originalWords.length || transIdx < transformedWords.length) {
      if (lcsIdx < lcs.length && 
          origIdx === lcs[lcsIdx].originalIndex && 
          transIdx === lcs[lcsIdx].transformedIndex) {
        // Words match, move forward
        charPos += originalWords[origIdx].text.length;
        origIdx++;
        transIdx++;
        lcsIdx++;
      } else {
        // Collect all consecutive non-matching words
        const origStartIdx = origIdx;
        const transStartIdx = transIdx;
        const startCharPos = charPos;
        
        // Calculate the actual character position from the original tokens
        let actualStartPos = 0;
        for (let i = 0; i < origStartIdx; i++) {
          actualStartPos = originalWords[i].pos + originalWords[i].text.length;
        }
        if (origStartIdx < originalWords.length) {
          actualStartPos = originalWords[origStartIdx].pos;
        }
        
        while (origIdx < originalWords.length &&
               (lcsIdx >= lcs.length || origIdx < lcs[lcsIdx].originalIndex)) {
          charPos += originalWords[origIdx].text.length;
          origIdx++;
        }
        
        let replacementText = '';
        while (transIdx < transformedWords.length &&
               (lcsIdx >= lcs.length || transIdx < lcs[lcsIdx].transformedIndex)) {
          replacementText += transformedWords[transIdx].text;
          transIdx++;
        }
        
        if (origIdx > origStartIdx && replacementText) {
          // Replace operation
          const oldTextLength = charPos - startCharPos;
          const oldText = originalWords.slice(origStartIdx, origIdx).map(w => w.text).join('');
          changeMap.replacements.set(actualStartPos, {
            length: oldTextLength,
            newText: replacementText
          });
        } else if (origIdx > origStartIdx) {
          // Delete operation
          changeMap.deletions.set(actualStartPos, charPos - startCharPos);
        } else if (replacementText) {
          // Add operation
          changeMap.additions.set(actualStartPos, replacementText);
        }
      }
    }
  }

  /**
   * Tokenize GraphQL into words/tokens for better diff
   */
  private tokenizeGraphQL(text: string): Array<{ text: string; pos: number }> {
    const tokens: Array<{ text: string; pos: number }> = [];
    const regex = /(\$\{\.\.\.}|\s+|[{}()\[\],:]|\w+|"[^"]*"|'[^']*')/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      tokens.push({ text: match[0], pos: match.index });
    }
    
    return tokens;
  }

  /**
   * Longest Common Subsequence algorithm for word-based diff
   */
  private longestCommonSubsequenceWords(
    tokens1: Array<{ text: string; pos: number }>,
    tokens2: Array<{ text: string; pos: number }>
  ): Array<{ originalIndex: number; transformedIndex: number }> {
    const m = tokens1.length;
    const n = tokens2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    // Build LCS table
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (tokens1[i - 1].text === tokens2[j - 1].text) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find the LCS
    const lcs: Array<{ originalIndex: number; transformedIndex: number }> = [];
    let i = m, j = n;
    
    while (i > 0 && j > 0) {
      if (tokens1[i - 1].text === tokens2[j - 1].text) {
        lcs.unshift({ originalIndex: i - 1, transformedIndex: j - 1 });
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  /**
   * Cook a raw string (handle escape sequences)
   */
  private cookString(raw: string): string {
    // Handle special cases where cooked should be null
    if (raw.includes('\\u') || raw.includes('\\x')) {
      // For invalid escape sequences, cooked should be null
      try {
        // Try to evaluate the string
        return eval(`"${raw.replace(/"/g, '\\"')}"`);
      } catch {
        return '';  // Return empty string instead of null for invalid escapes
      }
    }
    
    return raw
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
} 