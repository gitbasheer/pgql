describe('Full pipeline on mock vnext-dashboard', () => {
  it('runs extraction to PR gen', () => {
    cy.exec(
      'node dist/cli/main-cli.js --repo-url mock-vnext --schema productGraph --test-account test-user',
    );
    // Assert logs, no errors, PR file generated
    cy.readFile('output/pr-content.md').should('exist');
    cy.readFile('output/migration-report.json').then((report) => {
      expect(report.status).to.equal('success');
      expect(report.queriesExtracted).to.be.greaterThan(0);
      expect(report.transformationsApplied).to.be.greaterThan(0);
    });
  });

  it('validates transformed queries against schema', () => {
    cy.exec(
      'node dist/cli/main-cli.js validate --schema productGraph --queries output/transformed-queries.json',
    );
    cy.readFile('output/validation-report.json').then((report) => {
      expect(report.errors).to.have.length(0);
      expect(report.warnings).to.be.an('array');
    });
  });

  it('tests response compatibility', () => {
    cy.exec('node dist/cli/main-cli.js test-responses --old-api mock-old --new-api mock-new');
    cy.readFile('output/response-comparison.json').then((comparison) => {
      expect(comparison.compatible).to.be.true;
      expect(comparison.mappingUtilsGenerated).to.be.greaterThan(0);
    });
  });
});

describe('UI Pipeline Flow', () => {
  it('completes basic workflow', () => {
    cy.visit('/');
    cy.get('[data-cy=repo-input]').type('test-repo');
    cy.get('[data-cy=start-pipeline]').click();
    cy.get('[data-cy=pipeline-stage]').should('contain', 'Extraction');
    cy.get('[data-cy=pipeline-complete]', { timeout: 30000 }).should('be.visible');
  });

  it('handles errors gracefully', () => {
    cy.intercept('/api/pipeline/start', { statusCode: 500 }).as('apiError');
    cy.visit('/');
    cy.get('[data-cy=start-pipeline]').click();
    cy.get('[data-cy=error-message]').should('be.visible');
  });
});
