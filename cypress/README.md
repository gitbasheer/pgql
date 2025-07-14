# Cypress E2E Tests for GraphQL Migration Dashboard

## Setup

1. Start the mock server (in one terminal):
   ```bash
   cd ui && pnpm mock-server
   ```

2. Start the UI development server (in another terminal):
   ```bash
   pnpm ui:dev
   ```

3. Run the E2E tests:
   ```bash
   # Headless mode
   pnpm test:e2e

   # Interactive mode
   pnpm cypress:open
   ```

## Test Coverage

The E2E tests cover:

1. **Full Pipeline Flow** - From input to PR generation
   - Repository URL and schema endpoint input
   - Pipeline start confirmation
   - Progress bar advancement
   - Query extraction and display
   - Diff viewer modal interaction
   - PR generation

2. **Error Handling** - Invalid inputs and API errors
   - Invalid repository path error
   - Toast notifications
   - Form re-enabling for retry

3. **GitHub Integration** - Repository cloning
   - Clone modal interaction
   - Successful clone confirmation
   - Auto-population of repo path

4. **Real-time Features**
   - Log viewer presence
   - Pipeline stage display
   - Stage progression indicators

## Mock API

The tests use Cypress intercepts to mock API responses. Real WebSocket events are not tested in this basic setup but the UI structure for real-time updates is verified.

## Running Against Real Backend

To run against a real backend instead of mocks:

1. Ensure the backend is running on port 3000
2. Update `cypress.config.ts` to set `MOCK_API: false`
3. The tests will then make real API calls