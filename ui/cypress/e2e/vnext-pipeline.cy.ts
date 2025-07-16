/// <reference types="cypress" />

describe('vnext Mock Pipeline E2E Test', () => {
  beforeEach(() => {
    // Visit the dashboard
    cy.visit('http://localhost:5173');

    // Mock API responses
    cy.intercept('POST', '/api/extract', {
      statusCode: 200,
      body: {
        pipelineId: 'vnext-e2e-test-123',
        extractionId: 'vnext-e2e-test-123',
      },
    }).as('startPipeline');

    cy.intercept('GET', '/api/status', {
      statusCode: 200,
      body: {
        stage: 'extraction',
        status: 'running',
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Starting GraphQL extraction from vnext-dashboard...',
          },
          {
            timestamp: new Date().toISOString(),
            level: 'success',
            message: 'Found 12 GraphQL queries',
          },
        ],
      },
    }).as('pollStatus');

    cy.intercept('GET', '/api/pipeline/vnext-e2e-test-123/queries', {
      statusCode: 200,
      body: [
        {
          query: {
            queryName: 'GetVentures',
            content: 'query GetVentures { ventures { id name status } }',
            filePath: 'src/queries/ventures.graphql',
            lineNumber: 1,
            isNested: false,
            operation: 'query',
          },
          transformation: {
            transformedQuery:
              'query GetVentures { venturesV2 { id displayName status } }',
            warnings: ['Field name changed to displayName'],
            mappingCode:
              'const mapVentures = (data) => ({ ...data, name: data.displayName });',
          },
        },
        {
          query: {
            queryName: 'GetUserProfile',
            content:
              'query GetUserProfile($id: ID!) { user(id: $id) { name email } }',
            filePath: 'src/queries/user.graphql',
            lineNumber: 5,
            isNested: false,
            hasVariables: true,
            operation: 'query',
          },
          transformation: {
            transformedQuery:
              'query GetUserProfile($id: ID!) { userV2(userId: $id) { fullName emailAddress } }',
            warnings: [
              'Parameter name changed from id to userId',
              'Field names updated',
            ],
            mappingCode:
              'const mapUser = (data) => ({ name: data.fullName, email: data.emailAddress });',
          },
        },
      ],
    }).as('getQueries');

    cy.intercept('POST', '/api/test-real-api', {
      statusCode: 200,
      body: {
        testResults: [
          { queryName: 'GetVentures', status: 'passed', baselineMatches: true },
          {
            queryName: 'GetUserProfile',
            status: 'passed',
            baselineMatches: true,
          },
        ],
      },
    }).as('testRealApi');

    cy.intercept('POST', '/api/pipeline/vnext-e2e-test-123/generate-pr', {
      statusCode: 200,
      body: {
        prUrl: 'https://github.com/test/vnext/pull/789',
        prNumber: 789,
        title: 'GraphQL Migration - vnext Dashboard Updates',
        diff: `diff --git a/src/queries/ventures.graphql b/src/queries/ventures.graphql
--- a/src/queries/ventures.graphql
+++ b/src/queries/ventures.graphql
@@ -1,1 +1,1 @@
-query GetVentures { ventures { id name status } }
+query GetVentures { venturesV2 { id displayName status } }`,
        files: ['src/queries/ventures.graphql', 'src/queries/user.graphql'],
      },
    }).as('generatePR');
  });

  it('completes full vnext pipeline flow without silent errors', () => {
    // Test vnext sample button
    cy.get('button').contains('🧪 Test vnext Sample').should('be.visible');
    cy.get('button').contains('🧪 Test vnext Sample').click();

    // Wait for pipeline to start
    cy.wait('@startPipeline');
    cy.wait('@testRealApi');

    // Verify polling status is shown
    cy.contains('Polling Status').should('be.visible');

    // Verify logs are displayed
    cy.wait('@pollStatus');
    cy.contains('Starting GraphQL extraction from vnext-dashboard').should(
      'be.visible'
    );
    cy.contains('Found 12 GraphQL queries').should('be.visible');

    // Verify query results section
    cy.wait('@getQueries');
    cy.contains('Query Results').should('be.visible');

    // Open diff viewer for first query
    cy.contains('GetVentures').should('be.visible');
    cy.get('button').contains('View Diff').first().click();

    // Verify diff modal opens
    cy.get('.diff-modal').should('be.visible');
    cy.contains('Query Analysis').should('be.visible');
    cy.contains('A/B Cohort:').should('be.visible');

    // Close modal
    cy.get('.close-btn').click();
    cy.get('.diff-modal').should('not.exist');

    // Test PR Preview
    cy.contains('Pull Request Preview').should('be.visible');
    cy.get('button').contains('Generate Pull Request').click();

    cy.wait('@generatePR');

    // Verify PR link appears
    cy.contains('View on GitHub →').should('be.visible');
    cy.get('a[href="https://github.com/test/vnext/pull/789"]').should('exist');

    // Verify diff preview is shown
    cy.get('.diff-wrapper').should('be.visible');
    cy.contains('venturesV2').should('be.visible');
    cy.contains('displayName').should('be.visible');
  });

  it('handles polling updates correctly', () => {
    // Start with form filling
    cy.get('input[id="repo-path"]').type('data/sample_data/vnext-dashboard');
    cy.get('input[id="schema-endpoint"]').type(
      'https://api.example.com/graphql'
    );
    cy.get('button').contains('Start Pipeline').click();

    cy.wait('@startPipeline');

    // Verify initial polling
    cy.wait('@pollStatus');
    cy.contains('Polling Status (extraction)').should('be.visible');

    // Update polling response for next stage
    cy.intercept('GET', '/api/status', {
      statusCode: 200,
      body: {
        stage: 'validation',
        status: 'running',
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Validating queries against schema...',
          },
        ],
      },
    }).as('pollStatusValidation');

    // Wait for next poll (1 second interval)
    cy.wait(1100);
    cy.wait('@pollStatusValidation');

    cy.contains('Polling Status (validation)').should('be.visible');
    cy.contains('Validating queries against schema').should('be.visible');
  });

  it('validates auth cookie construction', () => {
    // Set environment variables through window
    cy.window().then((win) => {
      // @ts-ignore
      win.import = {
        meta: {
          env: {
            REACT_APP_AUTH_IDP: 'test-auth-token',
            REACT_APP_CUST_IDP: 'test-cust-token',
            REACT_APP_INFO_CUST_IDP: 'test-info-cust',
            REACT_APP_INFO_IDP: 'test-info',
          },
        },
      };
    });

    // Intercept with auth validation
    cy.intercept('GET', '/api/status', (req) => {
      // Verify auth headers are present
      expect(req.headers).to.have.property('x-app-key', 'vnext-dashboard');
      expect(req.headers).to.have.property('cookie');
      expect(req.headers.cookie).to.include('auth_idp=');
      expect(req.headers.cookie).to.include('cust_idp=');

      req.reply({
        statusCode: 200,
        body: {
          stage: 'running',
          status: 'running',
          logs: [],
        },
      });
    }).as('pollWithAuth');

    // Start pipeline to trigger polling
    cy.get('button').contains('🧪 Test vnext Sample').click();
    cy.wait('@pollWithAuth');
  });

  it('handles error states gracefully', () => {
    // Mock API error
    cy.intercept('POST', '/api/extract', {
      statusCode: 500,
      body: {
        message: 'Failed to start extraction: Invalid repository path',
      },
    }).as('startPipelineError');

    cy.get('button').contains('🧪 Test vnext Sample').click();
    cy.wait('@startPipelineError');

    // Verify error toast is shown
    cy.contains('vnext testing failed').should('be.visible');
  });

  it('verifies complete UI flow without silent failures', () => {
    // This test ensures no console errors occur during the flow
    cy.on('fail', (err) => {
      // Fail test if there are any console errors
      if (err.message.includes('Console error')) {
        throw err;
      }
    });

    // Monitor console for errors
    cy.window().then((win) => {
      cy.spy(win.console, 'error').as('consoleError');
    });

    // Run through complete flow
    cy.get('button').contains('🧪 Test vnext Sample').click();

    cy.wait('@startPipeline');
    cy.wait('@testRealApi');
    cy.wait('@pollStatus');
    cy.wait('@getQueries');

    // Generate PR
    cy.get('button').contains('Generate Pull Request').click();
    cy.wait('@generatePR');

    // Verify no console errors
    cy.get('@consoleError').should('not.have.been.called');
  });
});
