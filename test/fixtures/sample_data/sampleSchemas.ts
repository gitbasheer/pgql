/** @fileoverview GraphQL schemas loaded from data directory for testing */

import * as fs from 'fs';
import * as path from 'path';

// Base paths
const dataDir = path.resolve(__dirname, '../../../data');

// Load schema files
export const SCHEMA_CONTENT = fs.readFileSync(path.join(dataDir, 'schema.graphql'), 'utf-8');
export const BILLING_SCHEMA_CONTENT = fs.readFileSync(path.join(dataDir, 'billing-schema.graphql'), 'utf-8');

// Export schema metadata
export const SCHEMA_METADATA = {
  main: {
    path: 'data/schema.graphql',
    endpoint: 'productGraph',
    description: 'Main product graph schema for user/venture data'
  },
  billing: {
    path: 'data/billing-schema.graphql', 
    endpoint: 'offerGraph',
    description: 'Billing/offer graph schema for pricing and subscriptions'
  }
};

// Helper function to get schema by endpoint
export function getSchemaByEndpoint(endpoint: 'productGraph' | 'offerGraph'): string {
  return endpoint === 'offerGraph' ? BILLING_SCHEMA_CONTENT : SCHEMA_CONTENT;
}