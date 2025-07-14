What Problem Are We Solving?
Manual migration of GraphQL queries is slow, error-prone, and risky.
Complex queries use templates, variables, and dynamic fragments—hard to track and migrate by hand.
We need to find and fix all deprecated fields in our queries, but the true scope is hidden.
Our Automated Solution
Automated extraction: Finds every query, even those built with templates and variables.
Fragment resolution: Automatically includes all fragments, even dynamic ones.
Schema-driven validation: Checks every query against the latest schema, finds deprecated fields, and suggests fixes.
Automated transformation: Updates queries to use new schema fields.
Reverse mapping: Links every change back to the exact source file and line.
Response validation: Runs both old and new queries, compares results, and ensures no data loss.
Universal design: Works with any GraphQL service, not just PG.
Progress tracking: Real-time dashboard and validation reports.
Key Technical Features
UnifiedExtractor: Finds and extracts all queries, even from complex templates.
SchemaValidator: Validates queries, finds deprecated fields, and checks compliance.
MinimalChangeCalculator: Applies safe, automated query transformations.
ResponseMapper: Maps new query responses to match old data structures.
ResponseComparator: Compares original and transformed responses for data integrity.
UI Dashboard: Real-time monitoring, error display, and progress tracking.
Multi-schema support: Handles multiple GraphQL endpoints.
Feature flag: Instantly switch between old and new queries for A/B testing.
Benefits for the Whole Team
No more manual query hunting or risky migrations
Zero data loss, full validation
Easy to adapt as schemas change
Works for any app, any GraphQL service
Saves weeks of manual work
Next Steps
Get the correct schemas for all APIs
Run full extraction with fragment support
Validate and transform all queries
Map and compare responses
Track progress and fix any remaining issues
