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
});