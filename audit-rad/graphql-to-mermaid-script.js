const fs = require('fs');
const Papa = require('papaparse');

// Configuration - adjust these based on your CSV columns
const CONFIG = {
    csvFile: 'wamgeneralJun 30 2025 11_50 AM.csv',
    outputFile: 'graphql-queries.mmd',
    radNameColumn: 'rad_name', // Adjust to your actual column name
    queryColumn: 'query', // Adjust to your actual column name
};

// Function to extract pure GraphQL from a query string
function extractPureGraphQL(queryString) {
    if (!queryString) return null;
    
    // Remove any surrounding quotes
    queryString = queryString.trim().replace(/^["']|["']$/g, '');
    
    // Extract GraphQL query/mutation/fragment blocks
    const patterns = [
        /query\s+\w*\s*(\([^)]*\))?\s*{[\s\S]*}/,
        /mutation\s+\w*\s*(\([^)]*\))?\s*{[\s\S]*}/,
        /fragment\s+\w+\s+on\s+\w+\s*{[\s\S]*}/,
        /{[\s\S]*}/ // Generic GraphQL block
    ];
    
    for (const pattern of patterns) {
        const match = queryString.match(pattern);
        if (match) {
            return match[0];
        }
    }
    
    // If it looks like a GraphQL query already, return it
    if (queryString.includes('{') && queryString.includes('}')) {
        return queryString;
    }
    
    return null;
}

// Function to format GraphQL for Mermaid
function formatGraphQLForMermaid(graphql) {
    if (!graphql) return '';
    
    // Escape special characters for Mermaid
    return graphql
        .replace(/"/g, '\\"')
        .replace(/\n/g, '<br/>')
        .replace(/\s+/g, ' ')
        .trim();
}

// Main function
async function convertToMermaid() {
    try {
        // Read CSV file
        const csvContent = fs.readFileSync(CONFIG.csvFile, 'utf8');
        
        // Parse CSV
        const parseResult = Papa.parse(csvContent, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim()
        });
        
        if (parseResult.errors.length > 0) {
            console.error('CSV parsing errors:', parseResult.errors);
        }
        
        // Log available columns for debugging
        console.log('Available columns:', parseResult.meta.fields);
        console.log('Total rows:', parseResult.data.length);
        
        // Start building Mermaid diagram
        let mermaidContent = 'graph TD\n';
        let queryCount = 0;
        
        // Process each row
        parseResult.data.forEach((row, index) => {
            const radName = row[CONFIG.radNameColumn] || `Query_${index + 1}`;
            const queryContent = row[CONFIG.queryColumn];
            
            if (queryContent) {
                const pureGraphQL = extractPureGraphQL(queryContent);
                
                if (pureGraphQL) {
                    queryCount++;
                    const nodeId = `Q${queryCount}`;
                    const formattedQuery = formatGraphQLForMermaid(pureGraphQL);
                    
                    // Add node with rad name as title and GraphQL as content
                    mermaidContent += `    ${nodeId}["<b>${radName}</b><br/><br/>${formattedQuery}"]\n`;
                    
                    // Optional: Add styling
                    mermaidContent += `    style ${nodeId} fill:#f9f9f9,stroke:#333,stroke-width:2px\n`;
                }
            }
        });
        
        // Alternative format: Code blocks in Mermaid (if preferred)
        let alternativeContent = '```mermaid\ngraph LR\n';
        queryCount = 0;
        
        parseResult.data.forEach((row, index) => {
            const radName = row[CONFIG.radNameColumn] || `Query_${index + 1}`;
            const queryContent = row[CONFIG.queryColumn];
            
            if (queryContent) {
                const pureGraphQL = extractPureGraphQL(queryContent);
                
                if (pureGraphQL) {
                    queryCount++;
                    alternativeContent += `\n    subgraph ${radName}\n`;
                    alternativeContent += `        ${queryCount}["\`${pureGraphQL}\`"]\n`;
                    alternativeContent += `    end\n`;
                }
            }
        });
        alternativeContent += '```\n';
        
        // Create a simple list format as well
        let simpleFormat = '# GraphQL Queries\n\n';
        parseResult.data.forEach((row, index) => {
            const radName = row[CONFIG.radNameColumn] || `Query_${index + 1}`;
            const queryContent = row[CONFIG.queryColumn];
            
            if (queryContent) {
                const pureGraphQL = extractPureGraphQL(queryContent);
                
                if (pureGraphQL) {
                    simpleFormat += `## ${radName}\n\n`;
                    simpleFormat += '```graphql\n';
                    simpleFormat += pureGraphQL;
                    simpleFormat += '\n```\n\n';
                }
            }
        });
        
        // Write all formats to different files
        fs.writeFileSync(CONFIG.outputFile, mermaidContent);
        fs.writeFileSync(CONFIG.outputFile.replace('.mmd', '-alternative.mmd'), alternativeContent);
        fs.writeFileSync(CONFIG.outputFile.replace('.mmd', '-simple.md'), simpleFormat);
        
        console.log(`Successfully processed ${queryCount} GraphQL queries`);
        console.log(`Output files created:`);
        console.log(`- ${CONFIG.outputFile} (Mermaid diagram)`);
        console.log(`- ${CONFIG.outputFile.replace('.mmd', '-alternative.mmd')} (Alternative Mermaid format)`);
        console.log(`- ${CONFIG.outputFile.replace('.mmd', '-simple.md')} (Simple markdown format)`);
        
    } catch (error) {
        console.error('Error processing CSV:', error);
        
        // Provide helpful debugging info
        if (error.code === 'ENOENT') {
            console.error(`File not found: ${CONFIG.csvFile}`);
        }
    }
}

// Run the conversion
convertToMermaid();

// Export for module use
module.exports = { extractPureGraphQL, formatGraphQLForMermaid, convertToMermaid };