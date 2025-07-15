import { DeprecationRule } from '../../core/analyzer/SchemaDeprecationAnalyzer.js';

export const sampleDeprecationRules: DeprecationRule[] = [
  // Clear replacements
  {
    type: 'field',
    objectType: 'CustomerQuery',
    fieldName: 'venture',
    deprecationReason: 'Use ventureNode',
    replacement: 'ventureNode',
    isVague: false,
    action: 'replace'
  },
  {
    type: 'field',
    objectType: 'CustomerQuery',
    fieldName: 'project',
    deprecationReason: 'Use projectNode',
    replacement: 'projectNode',
    isVague: false,
    action: 'replace'
  },
  {
    type: 'field',
    objectType: 'CurrentUser',
    fieldName: 'ventures',
    deprecationReason: 'Use CustomerQuery.ventures',
    replacement: 'CustomerQuery.ventures',
    isVague: false,
    action: 'replace'
  },
  {
    type: 'field',
    objectType: 'CurrentUser',
    fieldName: 'projects',
    deprecationReason: 'Use CustomerQuery.projects',
    replacement: 'CustomerQuery.projects',
    isVague: false,
    action: 'replace'
  },
  {
    type: 'field',
    objectType: 'Venture',
    fieldName: 'logoUrl',
    deprecationReason: 'Use profile.logoUrl instead',
    replacement: 'profile.logoUrl',
    isVague: false,
    action: 'replace'
  },
  {
    type: 'field',
    objectType: 'Profile',
    fieldName: 'isInfinityStone',
    deprecationReason: 'switch to using aiOnboarded',
    replacement: 'aiOnboarded',
    isVague: false,
    action: 'replace'
  },
  // Vague deprecations
  {
    type: 'field',
    objectType: 'WAMProduct',
    fieldName: 'accountId',
    deprecationReason: 'Use the billing property to ensure forward compatibility',
    replacement: undefined,
    isVague: true,
    action: 'comment-out'
  },
  {
    type: 'field',
    objectType: 'WAMProduct',
    fieldName: 'data',
    deprecationReason: 'Use calculated fields to ensure forward compatibility',
    replacement: undefined,
    isVague: true,
    action: 'comment-out'
  },
  {
    type: 'field',
    objectType: 'WAMProduct',
    fieldName: 'gcEntity',
    deprecationReason: 'this field is unstable and may not exist in future versions of product-graph',
    replacement: undefined,
    isVague: true,
    action: 'comment-out'
  }
];

export const testQueries = {
  simple: {
    input: `
query GetUser {
  user {
    email
    ventures {
      id
      name
    }
  }
}`,
    expected: `
query GetUser {
  user {
    email
    CustomerQuery {
      ventures {
        id
        name
      }
    }
  }
}`
  },
  
  nestedReplacement: {
    input: `
query VentureDetails {
  venture(id: "123") {
    id
    logoUrl
    profile {
      name
      isInfinityStone
    }
  }
}`,
    expected: `
query VentureDetails {
  ventureNode(id: "123") {
    id
    profile {
      logoUrl
    }
    profile {
      name
      aiOnboarded
    }
  }
}`
  },
  
  vagueDeprecations: {
    input: `
query WebsiteData {
  website {
    id
    accountId
    data
    gcEntity
    planType
  }
}`,
    expected: `
# DEPRECATED: accountId - Use the billing property to ensure forward compatibility
# DEPRECATED: data - Use calculated fields to ensure forward compatibility
# DEPRECATED: gcEntity - this field is unstable and may not exist in future versions of product-graph
query WebsiteData {
  website {
    id
    planType
  }
}`
  },
  
  complexQuery: {
    input: `
query Dashboard {
  user {
    email
    ventures {
      id
      logoUrl
      projects {
        id
        product {
          ... on WebsiteProduct {
            accountId
            data
            planType
          }
        }
      }
    }
  }
  project(id: "456") {
    id
    status
  }
}`,
    expected: `
# DEPRECATED: accountId - Use the billing property to ensure forward compatibility
# DEPRECATED: data - Use calculated fields to ensure forward compatibility
query Dashboard {
  user {
    email
    CustomerQuery {
      ventures {
        id
        profile {
          logoUrl
        }
        projects {
          id
          product {
            ... on WebsiteProduct {
              planType
            }
          }
        }
      }
    }
  }
  projectNode(id: "456") {
    id
    status
  }
}`
  }
};