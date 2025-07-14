// RAD Synthesizer Field Analyzer
// This script parses synthesizer functions and extracts all field paths and entity requirements

class RADAnalyzer {
    constructor() {
        this.results = [];
        this.allFields = new Set();
        this.entityTypes = new Set();
    }

    // Extract field paths from entityPick calls
    extractEntityPickFields(code) {
        const fields = [];
        // Match entityPick patterns with both single quotes, double quotes, and template literals
        const entityPickRegex = /entityPick\s*\(\s*\w+\s*,\s*\[([\s\S]*?)\]\s*\)/g;
        
        let match;
        while ((match = entityPickRegex.exec(code)) !== null) {
            const fieldsStr = match[1];
            // Extract individual field paths
            const fieldMatches = fieldsStr.match(/['"`]([^'"`]+)['"`]/g);
            if (fieldMatches) {
                fieldMatches.forEach(field => {
                    const cleanField = field.replace(/['"`]/g, '');
                    fields.push(cleanField);
                    this.allFields.add(cleanField);
                });
            }
        }
        return fields;
    }

    // Extract entity types from filter operations
    extractEntityTypes(code) {
        const types = [];
        // Match entity.type === 'typename' patterns
        const typeRegex = /entity\.type\s*===\s*['"`]([^'"`]+)['"`]/g;
        
        let match;
        while ((match = typeRegex.exec(code)) !== null) {
            types.push(match[1]);
            this.entityTypes.add(match[1]);
        }

        // Also check for type patterns in find operations
        const findTypeRegex = /type\s*===\s*['"`]([^'"`]+)['"`]/g;
        while ((match = findTypeRegex.exec(code)) !== null) {
            types.push(match[1]);
            this.entityTypes.add(match[1]);
        }

        return [...new Set(types)];
    }

    // Extract direct property access patterns
    extractDirectAccess(code) {
        const accessPatterns = [];
        
        // Match profile.request.query patterns
        const queryRegex = /profile\.request\.query\.(\w+)/g;
        let match;
        while ((match = queryRegex.exec(code)) !== null) {
            accessPatterns.push(`profile.request.query.${match[1]}`);
        }

        // Match profile.entities patterns (not in filters)
        const entitiesRegex = /profile\.entities\.(\w+)/g;
        while ((match = entitiesRegex.exec(code)) !== null) {
            if (match[1] !== 'filter' && match[1] !== 'find' && match[1] !== 'map') {
                accessPatterns.push(`profile.entities.${match[1]}`);
            }
        }

        // Match direct entity property access in conditions
        const entityPropRegex = /(\w+)\.([a-zA-Z0-9_.]+)(?:\s*[=!<>]|\s*\?\?|\s*&&|\s*\|\|)/g;
        while ((match = entityPropRegex.exec(code)) !== null) {
            if (match[1] !== 'profile' && match[1] !== 'entity' && match[1] !== 'type') {
                accessPatterns.push(`${match[1]}.${match[2]}`);
            }
        }

        return [...new Set(accessPatterns)];
    }

    // Check if function uses joinEntities
    usesJoinEntities(code) {
        return code.includes('joinEntities');
    }

    // Check if function returns empty array or hardcoded values
    getReturnPattern(code) {
        if (code.includes('return [];') || code.includes('return[]')) {
            return 'empty_array';
        }
        if (code.includes('return [{') && (code.includes('"none"') || code.includes("'none'") || code.includes('"always"') || code.includes("'always'"))) {
            return 'hardcoded_values';
        }
        if (code.includes('profile => [{ type:"none"')) {
            return 'always_show';
        }
        return 'dynamic';
    }

    // Extract field paths from complex object access
    extractComplexFieldAccess(code) {
        const complexFields = [];
        
        // Match nested property access patterns like entity.features?.widgets
        const nestedRegex = /(\w+)\.([a-zA-Z0-9_?.]+)/g;
        let match;
        while ((match = nestedRegex.exec(code)) !== null) {
            if (match[1] === 'entity' || match[1] === 'site' || match[1] === 'siteWithCommerce') {
                const fieldPath = match[2].replace(/\?/g, ''); // Remove optional chaining
                complexFields.push(fieldPath);
            }
        }

        return [...new Set(complexFields)];
    }

    // Main analysis function
    analyzeSynthesizer(name, code) {
        const analysis = {
            name: name,
            entityPickFields: this.extractEntityPickFields(code),
            entityTypes: this.extractEntityTypes(code),
            directAccess: this.extractDirectAccess(code),
            complexFieldAccess: this.extractComplexFieldAccess(code),
            usesJoinEntities: this.usesJoinEntities(code),
            returnPattern: this.getReturnPattern(code),
            codeLength: code.length,
            complexity: this.assessComplexity(code)
        };

        this.results.push(analysis);
        return analysis;
    }

    // Assess complexity of the synthesizer
    assessComplexity(code) {
        let score = 0;
        if (code.includes('joinEntities')) score += 2;
        if (code.includes('filter')) score += 1;
        if (code.includes('map')) score += 1;
        if (code.includes('find')) score += 1;
        if (code.includes('request.query')) score += 1;
        if (code.length > 500) score += 1;
        if (code.length > 1000) score += 2;
        
        if (score <= 2) return 'simple';
        if (score <= 5) return 'medium';
        return 'complex';
    }

    // Generate comprehensive report
    generateReport() {
        const report = {
            totalSynthesizers: this.results.length,
            summary: {
                allUniqueFields: Array.from(this.allFields).sort(),
                allEntityTypes: Array.from(this.entityTypes).sort(),
                complexityDistribution: this.getComplexityDistribution(),
                returnPatternDistribution: this.getReturnPatternDistribution(),
                fieldUsageFrequency: this.getFieldUsageFrequency()
            },
            synthesizers: this.results
        };

        return report;
    }

    getComplexityDistribution() {
        const dist = { simple: 0, medium: 0, complex: 0 };
        this.results.forEach(r => dist[r.complexity]++);
        return dist;
    }

    getReturnPatternDistribution() {
        const dist = {};
        this.results.forEach(r => {
            dist[r.returnPattern] = (dist[r.returnPattern] || 0) + 1;
        });
        return dist;
    }

    getFieldUsageFrequency() {
        const freq = {};
        this.results.forEach(r => {
            r.entityPickFields.forEach(field => {
                freq[field] = (freq[field] || 0) + 1;
            });
        });
        
        // Sort by frequency
        return Object.entries(freq)
            .sort(([,a], [,b]) => b - a)
            .reduce((obj, [key, value]) => {
                obj[key] = value;
                return obj;
            }, {});
    }

    // Parse the input data and run analysis
    parseAndAnalyze(radData) {
        const synthesizers = this.parseSynthesizers(radData);
        synthesizers.forEach(({ name, code }) => {
            this.analyzeSynthesizer(name, code);
        });
        return this.generateReport();
    }

    // Parse synthesizer definitions from the raw text
    parseSynthesizers(text) {
        const synthesizers = [];
        const sections = text.split(/##\s+/);
        
        sections.forEach(section => {
            const lines = section.trim().split('\n');
            if (lines.length > 0) {
                const nameMatch = lines[0].match(/^([^\s]+)/);
                if (nameMatch) {
                    const name = nameMatch[1];
                    
                    // Find JavaScript code block
                    const codeStart = section.indexOf('```javascript');
                    const codeEnd = section.indexOf('```', codeStart + 1);
                    
                    if (codeStart !== -1 && codeEnd !== -1) {
                        const code = section.substring(codeStart + 13, codeEnd).trim();
                        synthesizers.push({ name, code });
                    }
                }
            }
        });
        
        return synthesizers;
    }
}

// Example usage with your RAD data
const analyzer = new RADAnalyzer();

// Your RAD data would go here - for demo, I'll create a sample
const sampleRADData = `
## Task-AddGEMSubscribers-gHLTYfjQb

\`\`\`javascript
profile => profile.entities
  .filter(entity => entity.type === 'wsbvnext')
  .map(entity => (
    entityPick(entity, [
      'accountId',
      'entitlementData',
      'gem.subscriberCount',
      'links.addSubscribers'
    ])
  ))
\`\`\`
`;

// Function to analyze your complete RAD data
function analyzeRADSynthesizers(radDataString) {
    const analyzer = new RADAnalyzer();
    const report = analyzer.parseAndAnalyze(radDataString);
    
    console.log('=== RAD SYNTHESIZER ANALYSIS REPORT ===\n');
    
    console.log(`Total Synthesizers Analyzed: ${report.totalSynthesizers}\n`);
    
    console.log('=== SUMMARY ===');
    console.log(`Unique Entity Types (${report.summary.allEntityTypes.length}):`, report.summary.allEntityTypes);
    console.log(`Total Unique Fields (${report.summary.allUniqueFields.length}):`, report.summary.allUniqueFields.slice(0, 20), '... (showing first 20)');
    console.log('Complexity Distribution:', report.summary.complexityDistribution);
    console.log('Return Pattern Distribution:', report.summary.returnPatternDistribution);
    
    console.log('\n=== TOP 20 MOST USED FIELDS ===');
    Object.entries(report.summary.fieldUsageFrequency).slice(0, 20).forEach(([field, count]) => {
        console.log(`${field}: ${count} times`);
    });
    
    console.log('\n=== DETAILED SYNTHESIZER BREAKDOWN ===');
    report.synthesizers.forEach(synth => {
        console.log(`\n--- ${synth.name} ---`);
        console.log(`Complexity: ${synth.complexity}`);
        console.log(`Return Pattern: ${synth.returnPattern}`);
        console.log(`Entity Types: ${synth.entityTypes.join(', ')}`);
        console.log(`Uses Join: ${synth.usesJoinEntities}`);
        console.log(`Fields Used (${synth.entityPickFields.length}): ${synth.entityPickFields.join(', ')}`);
        if (synth.directAccess.length > 0) {
            console.log(`Direct Access: ${synth.directAccess.join(', ')}`);
        }
    });
    
    return report;
}

// Export the analyzer for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RADAnalyzer, analyzeRADSynthesizers };
}

// To use this script with your data:
// 1. Copy your entire RAD data string
// 2. Call: analyzeRADSynthesizers(yourRadDataString)
// 3. The script will output a comprehensive analysis

console.log('RAD Synthesizer Analyzer ready!');
console.log('Usage: analyzeRADSynthesizers(yourRadDataString)');