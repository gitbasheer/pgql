# Security and Error Handling Audit Report

## Executive Summary

This audit identifies critical security vulnerabilities and error handling issues in the UI codebase that could lead to runtime errors, data leaks, and poor user experience.

## Critical Issues Found

### 1. Missing Null/Undefined Checks

#### Dashboard.tsx

- **Line 62**: `setPipelineStatus(status)` - No validation if status is null/undefined
- **Line 66**: `status.logs.length > logs.length` - No check if `status.logs` exists
- **Line 83**: `toast.error(\`Polling error: ${error.message}\`)` - No check if error has message property

#### QueryResults.tsx

- **Line 69-70**: Using optional chaining but no fallback UI when queries is not an array
- **Line 24**: `throw new Error('Failed to fetch queries')` - Generic error without details

#### RealApiTesting.tsx

- **Line 47**: `!authConfig.cookies || !authConfig.appKey` - No trim() to check for whitespace-only values
- **Line 164**: `result.comparisonResult.differences?.map()` - Assumes differences is always an array when defined

#### QueryDiffViewer.tsx

- **Line 104**: `gql(selectedQuery.query.content)` - Wrapped in try-catch but error not shown to user
- **Line 314**: `cohortData?.getCohort` - Heavy reliance on optional chaining without user feedback

### 2. Silent Errors

#### Dashboard.tsx

- **Line 80**: Console.error for polling errors but continues polling - user might not know about connection issues
- **Line 82-84**: Shows toast but doesn't provide actionable steps for the user

#### server.mjs

- **Multiple locations**: Catches errors but only logs to console, not visible to users
- **Line 106**: vnext extraction failure logged but pipeline might appear to continue

#### socket.ts

- **Line 27**: Console.warn for disconnect but user only sees toast if server-initiated
- **Line 36**: Connection errors logged but no retry logic exposed to user
- **Line 51**: Reconnection failure with generic message, no troubleshooting info

### 3. Data Leaks and Sensitive Information Exposure

#### Critical Security Issues:

##### server.mjs

- **Line 47**: Logs full request body including potential sensitive data: `console.log('Extract request:', { repoPath, schemaEndpoint, strategies })`
- **Line 84**: Logs extraction result summary which might contain sensitive query names
- **Line 321**: Logs full test request body: `console.log('Real API test request:', req.body)`
- **Line 1290**: Logs query information that could be sensitive

##### RealApiTesting.tsx

- **Line 86-88**: Auth cookies entered in password field but stored in plain state (not encrypted in memory)
- **Line 164**: Displays full diff path which might contain sensitive field names

##### GitHubIntegration.tsx

- **Line 45**: URL validation but no check for private repo access tokens in URL

### 4. Missing Error Boundaries

#### App.tsx

- ErrorBoundary exists but only at top level - individual components can crash entire sections

#### Missing Component-Level Protection:

- QueryDiffViewer (complex component with Apollo queries)
- RealApiTesting (handles auth data)
- Dashboard (main orchestrator)

### 5. Unvalidated API Responses

#### api.ts

- **Line 40-41**: Assumes error response has message property
- **Line 44**: Returns response.json() without schema validation
- **Line 54-55**: Same pattern repeated - no validation of error structure

#### server.mjs

- **Line 50**: Returns 400 with message but no error code
- **Line 125**: Assumes error.message exists
- **Line 163**: No validation of extractor.extractAll() response structure
- **Line 580**: GraphQL errors assumed to have specific structure

### 6. Optional Chaining Without Fallbacks

#### QueryDiffViewer.tsx

- **Line 129**: `item.query.queryName?.toLowerCase()` - No handling if all items filtered out
- **Line 316-325**: Cohort details with multiple optional chains but no loading/error states

#### Dashboard.tsx

- **Line 133**: `data.pipelineId || data.extractionId` - Assumes one exists

## Recommendations

### Immediate Actions Required

1. **Implement Response Validation**

   ```typescript
   // Add schema validation for all API responses
   import { z } from 'zod';

   const PipelineStatusSchema = z.object({
     stage: z.string(),
     status: z.enum(['pending', 'running', 'completed', 'failed']),
     logs: z
       .array(
         z.object({
           timestamp: z.string(),
           level: z.enum(['info', 'warn', 'error', 'success']),
           message: z.string(),
         })
       )
       .optional(),
   });
   ```

2. **Add Null Safety Utilities**

   ```typescript
   export function safeAccess<T>(value: T | null | undefined, fallback: T): T {
     return value ?? fallback;
   }
   ```

3. **Implement Secure State for Auth Data**

   ```typescript
   // Use refs for sensitive data to avoid React DevTools exposure
   const authConfigRef = useRef<AuthConfig>({ cookies: '', appKey: '' });
   ```

4. **Add Component-Level Error Boundaries**

   ```typescript
   <ErrorBoundary fallback={<QueryErrorFallback />}>
     <QueryDiffViewer queries={queries} />
   </ErrorBoundary>
   ```

5. **Remove or Sanitize Logging**
   - Remove all console.log statements with request/response data
   - Use structured logging with sanitization
   - Implement debug mode flag for development

### Security Enhancements

1. **Sanitize Error Messages**

   ```typescript
   function sanitizeError(error: unknown): string {
     if (error instanceof Error) {
       // Don't expose internal paths or sensitive data
       return error.message.replace(/\/[\w\/]+/g, '[path]');
     }
     return 'An unexpected error occurred';
   }
   ```

2. **Add Rate Limiting**
   - Implement client-side rate limiting for API calls
   - Add exponential backoff for retries

3. **Validate External Data**
   - Never trust data from localStorage
   - Validate all API responses against schemas
   - Sanitize user inputs before display

### User Experience Improvements

1. **Add Loading States**
   - Show skeletons instead of empty divs
   - Indicate background operations clearly

2. **Improve Error Messages**
   - Provide actionable steps
   - Include error codes for support
   - Add "Report Issue" functionality

3. **Add Telemetry (with consent)**
   - Track error rates
   - Monitor API response times
   - Detect patterns in failures

## Priority Matrix

| Issue                           | Severity | Effort | Priority |
| ------------------------------- | -------- | ------ | -------- |
| Auth data in plain state        | Critical | Low    | P0       |
| Console.log with sensitive data | Critical | Low    | P0       |
| Missing null checks             | High     | Medium | P1       |
| Unvalidated API responses       | High     | High   | P1       |
| Silent errors                   | Medium   | Medium | P2       |
| Missing error boundaries        | Medium   | Low    | P2       |

## Next Steps

1. Create tickets for each P0 issue
2. Implement response validation library
3. Add security linting rules
4. Set up error monitoring service
5. Conduct security review of auth flow
