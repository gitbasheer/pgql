# Vnext Sample Query Display Fix

## Problem
When clicking "Test vnext Sample" button, the extraction logs showed 36 queries were extracted successfully, but the QueryResults component displayed only 2 generic sample queries instead of the actual vnext queries.

## Root Cause
The vnext sample test endpoint (`/api/test-vnext-sample`) was extracting queries but not associating them with the pipeline created by the Dashboard component. The `/api/pipeline/:pipelineId/queries` endpoint was returning hardcoded sample data.

## Solution Implemented

### 1. Added Query Storage (server.mjs)
```javascript
// Added pipeline queries storage
let pipelineQueries = new Map(); // Store actual queries per pipeline
```

### 2. Updated Dashboard Component
Modified the vnext test call to include the pipelineId:
```javascript
body: JSON.stringify({
  pipelineId: extractData.pipelineId || extractData.extractionId,
  // ... other params
})
```

### 3. Enhanced Vnext Test Endpoint
The `/api/test-vnext-sample` endpoint now:
- Accepts `pipelineId` parameter
- Stores extracted queries in the `pipelineQueries` Map
- Maps vnext query structure to the expected format

### 4. Updated Query Retrieval
The `/api/pipeline/:pipelineId/queries` endpoint now:
- Checks `pipelineQueries` Map first for stored queries
- Falls back to sample data only if no queries are stored

### 5. Improved Pipeline Simulation
- Detects vnext sample paths and skips extraction stage
- Shows "Extraction completed via vnext sample data" in logs
- Starts directly from classification stage

## Testing
Created `test-vnext-flow.js` to verify the complete flow:
```bash
node ui/test-vnext-flow.js
```

## Result
Now when clicking "Test vnext Sample":
1. All 36 queries are extracted from data/sample_data/
2. Queries are properly stored under the pipeline ID
3. QueryResults component displays all 36 actual queries
4. Each query shows name, type, file path, endpoint, variables, and fragments
5. Pipeline progress skips extraction and moves directly to classification

## Files Modified
- `/ui/server.mjs` - Added query storage and retrieval logic
- `/ui/src/components/Dashboard.tsx` - Pass pipelineId to vnext test
- `/ui/start-ui-full.sh` - Fixed endpoint documentation
- `/ui/test-vnext-flow.js` - New test script for verification