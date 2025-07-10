# Baseline Fixture Dependencies

This document outlines the dependencies between the baseline fixture files.

*   **`fragments.js`**:
    *   Imports `profileInfinityStoneFragment` from `./profileFragments.js`.

*   **`offer-graph-queries.js`**:
    *   Requires `@apollo/client/core`.

*   **`profileFragments.js`**:
    *   No explicit imports.
    *   Defines fragments used by other files.

*   **`queryNames.js`**:
    *   No imports.
    *   Exports an object of query names.

*   **`quicklinks.js`**:
    *   Imports `gql` from `@apollo/client`.

*   **`shared-graph-queries-v1.js`**:
    *   Requires `@apollo/client/core`.
    *   Imports from `./fragments.js`.
    *   Imports from `./profileFragments.js`.
    *   Imports from `./queryNames.js`.

*   **`shared-graph-queries-v2.js`**:
    *   Requires `@apollo/client/core`.
    *   Imports from `./fragments.js`.
    *   Imports from `./queryNames.js`.

*   **`shared-graph-queries-v3.js`**:
    *   Requires `@apollo/client/core`.
    *   Imports from `./fragments.js`.
    *   Imports from `./queryNames.js`.
