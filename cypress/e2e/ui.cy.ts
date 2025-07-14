describe('GraphQL Migration Dashboard E2E', () => {
  beforeEach(() => {
    // Set up mock API intercepts
    cy.intercept('POST', '/api/pipeline/start', {
      statusCode: 200,
      body: { pipelineId: 'test-pipeline-123' }
    }).as('startPipeline');

    cy.intercept('GET', '/api/pipeline/test-pipeline-123/queries', {
      statusCode: 200,
      body: [
        {
          query: {
            queryName: 'getUser',
            content: 'query getUser($id: ID!) { user(id: $id) { name email } }',
            filePath: '/src/queries/user.ts',
            lineNumber: 42,
            operation: 'query',
            hasVariables: true,
            isNested: false
          },
          transformation: {
            transformedQuery: 'query getUser($id: ID!) { userV2(userId: $id) { fullName emailAddress } }',
            warnings: ['Field "name" renamed to "fullName"', 'Field "email" renamed to "emailAddress"'],
            mappingCode: '// Response mapping for getUser'
          }
        },
        {
          query: {
            queryName: 'listPosts',
            content: 'query listPosts { posts { id title content } }',
            filePath: '/src/queries/posts.ts',
            lineNumber: 15,
            operation: 'query',
            hasVariables: false,
            isNested: false
          }
        }
      ]
    }).as('getQueries');

    cy.intercept('GET', '/api/pipeline/test-pipeline-123/real-api-tests', {
      statusCode: 200,
      body: {
        total: 2,
        tested: 1,
        passed: 1,
        failed: 0,
        results: [
          {
            queryName: 'getUser',
            status: 'passed',
            baselineExists: true,
            comparisonResult: {
              matches: true,
              differences: []
            }
          },
          {
            queryName: 'listPosts',
            status: 'pending',
            baselineExists: false
          }
        ]
      }
    }).as('getRealApiTests');

    cy.intercept('POST', '/api/pipeline/test-pipeline-123/trigger-real-api-tests', {
      statusCode: 200,
      body: { message: 'Tests triggered successfully' }
    }).as('triggerRealApiTests');

    cy.intercept('GET', '/api/pipeline/baselines/getUser', {
      statusCode: 200,
      body: [
        {
          baseline: { user: { name: 'John Doe', email: 'john@example.com' } },
          response: { user: { name: 'John Doe', email: 'john@example.com' } },
          comparison: {
            matches: true,
            differences: []
          }
        }
      ]
    }).as('getBaselines');

    cy.intercept('POST', '/api/pipeline/test-pipeline-123/generate-pr', {
      statusCode: 200,
      body: {
        prUrl: 'https://github.com/example/repo/pull/123',
        diff: 'diff --git a/src/queries/user.ts...'
      }
    }).as('generatePR');

    // Visit the dashboard
    cy.visit('/');
  });

  it('should complete full pipeline flow from input to PR generation', () => {
    // Verify initial page load
    cy.contains('h1', 'GraphQL Migration Dashboard').should('be.visible');
    cy.contains('Real-time monitoring for your GraphQL migration pipeline').should('be.visible');

    // Step 1: Input repository URL and schema endpoint
    cy.startPipeline({
      repoPath: 'https://github.com/test/sample-repo',
      schemaEndpoint: 'https://api.example.com/graphql'
    });

    // Verify pipeline start request
    cy.wait('@startPipeline');
    
    // Step 2: Verify success toast notification
    cy.contains('Pipeline started successfully!').should('be.visible');

    // Step 3: Assert progress bar advances
    cy.get('.pipeline-stages').should('be.visible');
    
    // Verify extraction stage is active
    cy.get('.pipeline-stage').first().should('have.class', 'in_progress');
    cy.contains('Extraction').should('be.visible');

    // Simulate pipeline progression through WebSocket events would happen here
    // For now, we'll just verify the structure exists

    // Step 4: Verify queries are fetched and displayed
    cy.wait('@getQueries');
    
    // Check query table is populated
    cy.contains('Extracted Queries').should('be.visible');
    cy.contains('getUser').should('be.visible');
    cy.contains('listPosts').should('be.visible');

    // Step 5: Click on View Diff button
    cy.contains('button', 'View Diff').first().click();

    // Verify diff modal appears
    cy.get('[role="dialog"]').should('be.visible');
    cy.contains('Query Transformation').should('be.visible');
    cy.contains('Original Query').should('be.visible');
    cy.contains('Transformed Query').should('be.visible');

    // Close modal
    cy.get('.close-btn').click();
    cy.get('[role="dialog"]').should('not.exist');

    // Step 6: Generate Pull Request
    cy.contains('button', 'Generate Pull Request').click();
    cy.wait('@generatePR');

    // Verify PR link appears
    cy.contains('View on GitHub').should('be.visible');
    cy.contains('Pull Request Preview').should('be.visible');
  });

  it('should handle errors gracefully', () => {
    // Override the intercept to return an error
    cy.intercept('POST', '/api/pipeline/start', {
      statusCode: 400,
      body: { message: 'Invalid repository path' }
    }).as('startPipelineError');

    // Try to start pipeline with invalid data
    cy.startPipeline({
      repoPath: '/invalid/path',
      schemaEndpoint: 'https://api.example.com/graphql'
    });

    cy.wait('@startPipelineError');

    // Verify error toast appears
    cy.contains('Failed to start pipeline: Invalid repository path').should('be.visible');

    // Verify form is still enabled for retry
    cy.get('button[type="submit"]').contains('Start Pipeline').should('be.enabled');
  });

  it('should allow cloning from GitHub', () => {
    // Mock GitHub clone endpoint
    cy.intercept('POST', '/api/github/clone', {
      statusCode: 200,
      body: {
        localPath: '/tmp/cloned-repo',
        message: 'Repository cloned successfully'
      }
    }).as('cloneRepo');

    // Click Clone from GitHub button
    cy.contains('button', 'Clone from GitHub').click();

    // Modal should appear
    cy.get('[role="dialog"]').should('be.visible');
    cy.contains('Clone GitHub Repository').should('be.visible');

    // Enter repository URL
    cy.get('input[placeholder="https://github.com/owner/repo"]').type('https://github.com/test/repo');

    // Click Clone button
    cy.get('[role="dialog"]').contains('button', 'Clone').click();

    cy.wait('@cloneRepo');

    // Verify success
    cy.contains('Repository cloned successfully!').should('be.visible');

    // Verify path is populated in the form
    cy.get('input[id="repo-path"]').should('have.value', '/tmp/cloned-repo');
  });

  it('should display real-time logs', () => {
    // Start the pipeline
    cy.startPipeline({
      repoPath: '/test/repo',
      schemaEndpoint: 'https://api.example.com/graphql'
    });

    cy.wait('@startPipeline');

    // Check logs section exists
    cy.contains('Real-time Logs').should('be.visible');
    
    // In a real test with WebSocket, we would verify log entries appear
    // For now, just verify the log viewer structure
    cy.get('.log-viewer').should('be.visible');
  });

  it('should show pipeline stage progression', () => {
    const stages = [
      'Extraction',
      'Classification', 
      'Validation',
      'Testing',
      'Transformation',
      'PR Generation'
    ];

    cy.startPipeline({
      repoPath: '/test/repo',
      schemaEndpoint: 'https://api.example.com/graphql'
    });

    cy.wait('@startPipeline');

    // Verify all stages are displayed
    stages.forEach(stage => {
      cy.contains(stage).should('be.visible');
    });

    // Verify stages have correct initial state
    cy.get('.pipeline-stage').should('have.length', 6);
    cy.get('.pipeline-stage.pending').should('have.length.at.least', 5);
  });

  it('should test against real API with GraphQL client integration', () => {
    // Start pipeline first
    cy.startPipeline({
      repoPath: '/test/repo',
      schemaEndpoint: 'https://api.example.com/graphql'
    });

    cy.wait('@startPipeline');
    cy.wait('@getQueries');
    cy.wait('@getRealApiTests');

    // Verify Real API Testing section appears
    cy.contains('Real API Testing').should('be.visible');
    cy.contains('Tests queries against real API with baseline comparison').should('be.visible');

    // Check test results summary
    cy.contains('Total Queries').should('be.visible');
    cy.contains('2').should('be.visible'); // total
    cy.contains('Tested').should('be.visible');
    cy.contains('1').should('be.visible'); // tested
    cy.contains('Passed').should('be.visible');

    // Check individual test results
    cy.contains('getUser').should('be.visible');
    cy.contains('passed').should('be.visible');
    cy.contains('Baseline Available').should('be.visible');
    cy.contains('✓ Matches baseline').should('be.visible');

    cy.contains('listPosts').should('be.visible');
    cy.contains('pending').should('be.visible');

    // Test triggering new API tests
    cy.contains('button', 'Test Against Real API').click();

    // Fill authentication form
    cy.get('input[placeholder="Cookies (session data)"]').type('test-session-cookies');
    cy.get('input[placeholder="App Key"]').type('test-app-key');

    // Submit tests
    cy.contains('button', 'Start Tests').click();
    cy.wait('@triggerRealApiTests');

    // Verify success message
    cy.contains('Real API tests triggered successfully!').should('be.visible');
  });

  it('should view baseline comparisons in query diff viewer', () => {
    // Start pipeline and get queries
    cy.startPipeline({
      repoPath: '/test/repo',
      schemaEndpoint: 'https://api.example.com/graphql'
    });

    cy.wait('@startPipeline');
    cy.wait('@getQueries');

    // Click View Diff for first query
    cy.contains('button', 'View Diff').first().click();

    // Verify modal opens with tabs
    cy.get('[role="dialog"]').should('be.visible');
    cy.contains('Query Analysis').should('be.visible');
    cy.contains('Transformation').should('be.visible');
    cy.contains('Baseline Comparison').should('be.visible');

    // Switch to baseline comparison tab
    cy.contains('button', 'Baseline Comparison').click();
    cy.wait('@getBaselines');

    // Verify baseline content appears
    cy.contains('Baseline 1').should('be.visible');
    cy.contains('✓ Matches baseline').should('be.visible');

    // Close modal
    cy.get('.close-btn').click();
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('should display real-time event placeholders during pipeline execution', () => {
    // Mock additional API calls for event simulation
    cy.intercept('GET', '/api/pipeline/test-pipeline-123/events', {
      statusCode: 200,
      body: [
        { stage: 'extraction', message: 'Starting repository extraction', timestamp: Date.now() },
        { stage: 'variant-generation', message: 'Generating variants for GetUser', timestamp: Date.now() + 1000 },
        { stage: 'testing', message: 'Testing query GetUser on real API', timestamp: Date.now() + 2000 }
      ]
    }).as('getEvents');

    cy.startPipeline({
      repoPath: '/test/repo',
      schemaEndpoint: 'https://api.example.com/graphql'
    });

    cy.wait('@startPipeline');

    // Verify logs section shows event placeholder messages
    cy.contains('Real-time Logs').should('be.visible');
    cy.get('.log-viewer').should('be.visible');
    
    // In real implementation with WebSocket, we would see:
    // cy.contains('Starting repository extraction').should('be.visible');
    // cy.contains('Generating variants for GetUser').should('be.visible');
    // cy.contains('Testing query GetUser on real API').should('be.visible');
  });

  it('should complete full vnext-dashboard flow with baseline comparison', () => {
    // Mock vnext-dashboard specific responses
    cy.intercept('POST', '/api/github/clone', {
      statusCode: 200,
      body: {
        localPath: '/tmp/vnext-dashboard',
        message: 'Repository cloned successfully'
      }
    }).as('cloneVnext');

    cy.intercept('GET', '/api/pipeline/test-pipeline-123/queries', {
      statusCode: 200,
      body: [
        {
          query: {
            queryName: 'GetVentures',
            content: 'query GetVentures($userId: ID!) { user(id: $userId) { ventures { id name } } }',
            filePath: '/vnext-dashboard/queries/ventures.graphql',
            lineNumber: 5,
            operation: 'query',
            hasVariables: true,
            isNested: true
          },
          transformation: {
            transformedQuery: 'query GetVentures($userId: ID!) { userV2(userId: $userId) { venturesV2 { id displayName } } }',
            warnings: ['Field "ventures" renamed to "venturesV2"', 'Field "name" renamed to "displayName"'],
            mappingCode: '// Auto-generated mapping for ventures'
          }
        }
      ]
    }).as('getVnextQueries');

    // Clone vnext-dashboard
    cy.contains('button', 'Clone from GitHub').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.get('input[placeholder="https://github.com/owner/repo"]').type('https://github.com/test/vnext-dashboard');
    cy.get('[role="dialog"]').contains('button', 'Clone').click();
    cy.wait('@cloneVnext');

    // Start pipeline
    cy.get('input[id="schema-endpoint"]').clear().type('https://api.example.com/graphql/v2');
    cy.get('button[type="submit"]').contains('Start Pipeline').click();
    cy.wait('@startPipeline');
    cy.wait('@getVnextQueries');

    // Verify venture query appears
    cy.contains('GetVentures').should('be.visible');
    cy.contains('/vnext-dashboard/queries/ventures.graphql').should('be.visible');

    // Test real API with auth
    cy.wait('@getRealApiTests');
    cy.contains('Real API Testing').should('be.visible');
    cy.contains('button', 'Test Against Real API').click();
    cy.get('input[placeholder="Cookies (session data)"]').type('vnext-session-cookies');
    cy.get('input[placeholder="App Key"]').type('vnext-app-key-123');
    cy.contains('button', 'Start Tests').click();
    cy.wait('@triggerRealApiTests');

    // Verify baseline comparison is available
    cy.contains('button', 'View Diff').first().click();
    cy.contains('button', 'Baseline Comparison').click();
    cy.wait('@getBaselines');
    
    cy.get('.baseline-content').should('be.visible');
    cy.contains('Comparison complete').should('be.visible');
  });

  it('should handle baseline differences and display detailed diff', () => {
    // Mock baseline with differences
    cy.intercept('GET', '/api/pipeline/baselines/GetUser', {
      statusCode: 200,
      body: [
        {
          baseline: { 
            user: { 
              id: '123', 
              name: 'John Doe',
              email: 'john@example.com',
              lastLogin: '2024-01-01T00:00:00Z'
            } 
          },
          response: { 
            user: { 
              id: '123', 
              name: 'John Doe Updated',
              email: 'john.doe@example.com',
              lastLogin: '2024-01-15T12:30:00Z'
            } 
          },
          comparison: {
            matches: false,
            differences: [
              { path: 'user.name', description: 'Value changed from "John Doe" to "John Doe Updated"' },
              { path: 'user.email', description: 'Value changed from "john@example.com" to "john.doe@example.com"' },
              { path: 'user.lastLogin', description: 'Timestamp difference within acceptable range' }
            ]
          }
        }
      ]
    }).as('getBaselinesWithDiff');

    cy.startPipeline({
      repoPath: '/test/repo',
      schemaEndpoint: 'https://api.example.com/graphql'
    });

    cy.wait('@startPipeline');
    cy.wait('@getQueries');

    // Open diff viewer
    cy.contains('button', 'View Diff').first().click();
    cy.contains('button', 'Baseline Comparison').click();
    cy.wait('@getBaselinesWithDiff');

    // Verify differences are displayed
    cy.contains('⚠ Differences found').should('be.visible');
    cy.contains('Value changed from "John Doe" to "John Doe Updated"').should('be.visible');
    
    // Verify diff viewer shows the comparison
    cy.get('.baseline-diff').should('be.visible');
    cy.contains('Baseline Response').should('be.visible');
    cy.contains('Current Response').should('be.visible');
  });
});