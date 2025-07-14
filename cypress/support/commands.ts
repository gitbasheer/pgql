// Cypress custom commands

// Add type definitions for custom commands
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command to start the pipeline with given configuration
       */
      startPipeline(config: {
        repoPath: string;
        schemaEndpoint: string;
        testApiUrl?: string;
        testAccountId?: string;
      }): Chainable<void>;
    }
  }
}

// Custom command to start pipeline
Cypress.Commands.add('startPipeline', (config) => {
  cy.get('input[id="repo-path"]').type(config.repoPath);
  cy.get('input[id="schema-endpoint"]').type(config.schemaEndpoint);
  
  if (config.testApiUrl) {
    cy.get('input[id="test-api"]').type(config.testApiUrl);
  }
  
  if (config.testAccountId) {
    cy.get('input[id="test-account"]').type(config.testAccountId);
  }
  
  cy.get('button[type="submit"]').contains('Start Pipeline').click();
});

export {};