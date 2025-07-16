import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Vnext Sample Data Extractor
 * Extracts all GraphQL queries from the data/sample_data/ directory
 * to create comprehensive test scenarios
 */
export class VnextSampleExtractor {
  constructor() {
    this.dataDir = '../data/sample_data/';
    this.schemasDir = '../data/';
    this.extractedQueries = [];
    this.fragments = new Map();
    this.queryNames = {};
  }

  /**
   * Extract all queries and fragments from the sample data
   */
  async extractAll() {
    console.log('🔍 Extracting vnext sample data...');
    
    // Load query names mapping
    await this.loadQueryNames();
    
    // Load fragments
    await this.loadFragments();
    
    // Extract queries from all sample files
    await this.extractQueries();
    
    // Generate test scenarios
    const testScenarios = this.generateTestScenarios();
    
    console.log(`✅ Extracted ${this.extractedQueries.length} queries and ${this.fragments.size} fragments`);
    
    return {
      schemas: this.getSchemas(),
      queries: this.extractedQueries,
      fragments: Array.from(this.fragments.entries()),
      testScenarios,
      summary: {
        totalQueries: this.extractedQueries.length,
        totalFragments: this.fragments.size,
        testScenarios: testScenarios.length,
        schemaEndpoints: ['productGraph', 'offerGraph']
      }
    };
  }

  /**
   * Load query names mapping from queryNames.js
   */
  async loadQueryNames() {
    try {
      const queryNamesPath = join(this.dataDir, 'queryNames.js');
      const content = readFileSync(queryNamesPath, 'utf8');
      
      // Extract the queryNames object using regex
      const match = content.match(/export const queryNames = ({[^}]+})/s);
      if (match) {
        // Simple extraction of key-value pairs
        const queryNamesStr = match[1];
        const pairs = queryNamesStr.match(/(\w+):\s*'([^']+)'/g) || [];
        
        pairs.forEach(pair => {
          const [, key, value] = pair.match(/(\w+):\s*'([^']+)'/);
          this.queryNames[key] = value;
        });
      }
      
      console.log(`📝 Loaded ${Object.keys(this.queryNames).length} query names`);
    } catch (error) {
      console.warn('⚠️  Could not load query names:', error.message);
    }
  }

  /**
   * Load and parse fragments from fragments.js and profileFragments.js
   */
  async loadFragments() {
    const fragmentFiles = ['fragments.js', 'profileFragments.js'];
    
    for (const file of fragmentFiles) {
      try {
        const fragmentPath = join(this.dataDir, file);
        const content = readFileSync(fragmentPath, 'utf8');
        
        // Extract fragment definitions
        const fragmentMatches = content.match(/const\s+(\w+)\s*=\s*gql\`([^`]+)\`/g) || [];
        
        fragmentMatches.forEach(match => {
          const [, name, fragmentContent] = match.match(/const\s+(\w+)\s*=\s*gql\`([^`]+)\`/);
          this.fragments.set(name, {
            name,
            source: fragmentContent.trim(),
            file
          });
        });
        
        console.log(`📄 Loaded fragments from ${file}`);
      } catch (error) {
        console.warn(`⚠️  Could not load fragments from ${file}:`, error.message);
      }
    }
  }

  /**
   * Extract queries from all sample data files
   */
  async extractQueries() {
    const sampleFiles = readdirSync(this.dataDir).filter(file => 
      file.endsWith('.js') && file !== 'queryNames.js'
    );

    for (const file of sampleFiles) {
      try {
        const filePath = join(this.dataDir, file);
        const content = readFileSync(filePath, 'utf8');
        
        // Extract query definitions
        const queryMatches = content.match(/gql\`([^`]+)\`/g) || [];
        
        queryMatches.forEach((match, index) => {
          const queryContent = match.replace(/gql\`/, '').replace(/\`$/, '');
          const queryName = this.extractQueryName(queryContent) || `Query_${file}_${index}`;
          
          this.extractedQueries.push({
            name: queryName,
            source: queryContent.trim(),
            file,
            type: this.determineQueryType(queryContent),
            variables: this.extractVariables(queryContent),
            fragments: this.extractFragmentReferences(queryContent),
            endpoint: this.determineEndpoint(queryContent)
          });
        });
        
        console.log(`📄 Extracted queries from ${file}`);
      } catch (error) {
        console.warn(`⚠️  Could not extract queries from ${file}:`, error.message);
      }
    }
  }

  /**
   * Extract query name from GraphQL content
   */
  extractQueryName(content) {
    // Try to find query name in content
    const queryMatch = content.match(/query\s+(\w+)/);
    if (queryMatch) {
      return queryMatch[1];
    }
    
    // Try to find mutation name
    const mutationMatch = content.match(/mutation\s+(\w+)/);
    if (mutationMatch) {
      return mutationMatch[1];
    }
    
    // Look for query names from the queryNames object
    const queryNameMatch = content.match(/\$\{queryNames\.(\w+)\}/);
    if (queryNameMatch) {
      const key = queryNameMatch[1];
      return this.queryNames[key] || key;
    }
    
    return null;
  }

  /**
   * Determine query type (query, mutation, subscription)
   */
  determineQueryType(content) {
    if (content.includes('mutation')) return 'mutation';
    if (content.includes('subscription')) return 'subscription';
    return 'query';
  }

  /**
   * Extract variables from GraphQL content
   */
  extractVariables(content) {
    const variables = [];
    const variableMatches = content.match(/\$\w+:\s*[^,\)]+/g) || [];
    
    variableMatches.forEach(match => {
      const [name, type] = match.split(':').map(s => s.trim());
      variables.push({ name, type });
    });
    
    return variables;
  }

  /**
   * Extract fragment references from GraphQL content
   */
  extractFragmentReferences(content) {
    const fragments = [];
    const fragmentMatches = content.match(/\.\.\.(\w+)/g) || [];
    
    fragmentMatches.forEach(match => {
      const fragmentName = match.replace('...', '');
      fragments.push(fragmentName);
    });
    
    return fragments;
  }

  /**
   * Determine which endpoint this query targets
   */
  determineEndpoint(content) {
    // Look for billing/offer-specific queries
    if (content.includes('transitions') || content.includes('modifyBasketWithOptions')) {
      return 'offerGraph';
    }
    
    // Look for billing-specific types
    if (content.includes('BillingQuery') || content.includes('BillingMutation')) {
      return 'offerGraph';
    }
    
    // Default to product graph
    return 'productGraph';
  }

  /**
   * Get available schemas
   */
  getSchemas() {
    const schemas = [];
    
    try {
      const schemaPath = join(this.schemasDir, 'schema.graphql');
      const schemaContent = readFileSync(schemaPath, 'utf8');
      schemas.push({
        name: 'productGraph',
        file: 'schema.graphql',
        content: schemaContent
      });
    } catch (error) {
      console.warn('⚠️  Could not load main schema:', error.message);
    }
    
    try {
      const billingSchemaPath = join(this.schemasDir, 'billing-schema.graphql');
      const billingSchemaContent = readFileSync(billingSchemaPath, 'utf8');
      schemas.push({
        name: 'offerGraph',
        file: 'billing-schema.graphql',
        content: billingSchemaContent
      });
    } catch (error) {
      console.warn('⚠️  Could not load billing schema:', error.message);
    }
    
    return schemas;
  }

  /**
   * Generate comprehensive test scenarios
   */
  generateTestScenarios() {
    const scenarios = [];
    
    // Group queries by endpoint
    const productGraphQueries = this.extractedQueries.filter(q => q.endpoint === 'productGraph');
    const offerGraphQueries = this.extractedQueries.filter(q => q.endpoint === 'offerGraph');
    
    // Basic dashboard queries test
    scenarios.push({
      name: 'Dashboard Queries (Product Graph)',
      description: 'Test core dashboard queries against product graph',
      endpoint: 'productGraph',
      queries: productGraphQueries.filter(q => 
        q.name.includes('Dashboard') || q.name.includes('Venture') || q.name.includes('User')
      ).slice(0, 5),
      variables: this.generateTestVariables('productGraph')
    });
    
    // Billing/commerce queries test
    scenarios.push({
      name: 'Billing Queries (Offer Graph)',
      description: 'Test billing and commerce queries against offer graph',
      endpoint: 'offerGraph', 
      queries: offerGraphQueries.slice(0, 3),
      variables: this.generateTestVariables('offerGraph')
    });
    
    // Fragment resolution test
    scenarios.push({
      name: 'Fragment Resolution Test',
      description: 'Test queries with complex fragment dependencies',
      endpoint: 'productGraph',
      queries: productGraphQueries.filter(q => q.fragments.length > 0).slice(0, 3),
      variables: this.generateTestVariables('productGraph')
    });
    
    // Variable pattern test
    scenarios.push({
      name: 'Variable Pattern Test',
      description: 'Test queries with different variable patterns',
      endpoint: 'productGraph',
      queries: productGraphQueries.filter(q => q.variables.length > 0).slice(0, 4),
      variables: this.generateTestVariables('productGraph')
    });
    
    return scenarios;
  }

  /**
   * Generate test variables for different endpoints
   */
  generateTestVariables(endpoint) {
    const baseVariables = {
      ventureId: 'test-venture-123',
      domainName: 'example.com',
      websiteId: 'test-website-456',
      entitlementId: 'test-entitlement-789'
    };
    
    if (endpoint === 'offerGraph') {
      return {
        ...baseVariables,
        subscriptionId: 'test-subscription-123',
        productFilter: 'domains',
        enableOptimizationFlow: true,
        currency: 'USD',
        market: 'US'
      };
    }
    
    return baseVariables;
  }
}

// Export for use in server
export default VnextSampleExtractor;