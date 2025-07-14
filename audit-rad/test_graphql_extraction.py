#!/usr/bin/env python3
"""
Test script for graphql-to-mermaid-python.py
Tests the extraction of JavaScript/GraphQL queries from CSV data
"""

import csv
import os
import tempfile
import unittest
from pathlib import Path

# Import the functions from the main script
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import functions directly from the script
exec(open('graphql-to-mermaid-python.py').read(), globals())
# Now extract_pure_graphql and format_graphql_for_mermaid are available

class TestGraphQLExtraction(unittest.TestCase):
    
    def setUp(self):
        """Set up test fixtures"""
        self.test_data_dir = tempfile.mkdtemp()
        self.csv_file = os.path.join(self.test_data_dir, 'test_data.csv')
        self.output_file = os.path.join(self.test_data_dir, 'test_output.md')
        
    def tearDown(self):
        """Clean up test files"""
        import shutil
        shutil.rmtree(self.test_data_dir, ignore_errors=True)
    
    def create_test_csv(self, rows):
        """Create a test CSV file with given rows"""
        with open(self.csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
    
    def test_simple_entity_pick_extraction(self):
        """Test extraction of simple entityPick pattern"""
        test_query = """profile => profile.entities
  .filter(entity => entity.type === 'wsbvnext')
  .map(entity => (
    entityPick(entity, [
      'accountId',
      'entitlementData',
      'gem.subscriberCount',
      'links.addSubscribers'
    ])
  ))"""
        
        result = extract_pure_graphql(test_query)
        self.assertEqual(result.strip(), test_query.strip())
    
    def test_complex_query_with_destructuring(self):
        """Test extraction of complex query with destructuring"""
        test_query = """profile => {
  const {
    request: {
      query: {
        ventureId,
        appLocation
      } = {}
    } = {}
  } = profile || {};
  
  let tabPath = 'venture/upgrade/plan';

  const entityData = profile.entities
  .filter(entity => entity.type === 'wsbvnext')
  .map(entity => (
    entityPick(entity, [
      'accountId',
      'features.websiteType',
      'vnextAccount.billing.termType',
      'vnextAccount.billing.autoRenew',
      'vnextAccount.account.paymentStatus',
      'vnextAccount.billing.commitment',
      'vnextAccount.ventureId'
    ])
  ));
  
  if(appLocation && appLocation === 'uvh-dashboard-website') {
    tabPath = 'venture/website/upgrade/plan';
  }
  
  if (ventureId) {
    return [{
      ...entityData[0],
      ventureId,
      tabPath
    }]
  }
  else {
    return [{
      ...entityData[0],
      ventureId: entityData[0].vnextAccount.ventureId,
      tabPath
    }]
  }
    
  return [];
}"""
        
        result = extract_pure_graphql(test_query)
        self.assertEqual(result.strip(), test_query.strip())
    
    def test_join_entities_pattern(self):
        """Test extraction of joinEntities pattern"""
        test_query = """profile => joinEntities(profile.entities, profile.entities, (a, b) => (
  a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId
)).map(entity => {
  return entityPick(entity, [
    'mktgasst.id',
    'mktgasst.type',
    'wsbvnext.id',
    'wsbvnext.type',
    'wsbvnext.accountId',
    'wsbvnext.customerIntentions'
  ])
})"""
        
        result = extract_pure_graphql(test_query)
        self.assertEqual(result.strip(), test_query.strip())
    
    def test_empty_return_pattern(self):
        """Test extraction of empty return pattern"""
        test_query = """profile => {
  return [];
}"""
        
        result = extract_pure_graphql(test_query)
        self.assertEqual(result.strip(), test_query.strip())
    
    def test_full_csv_processing(self):
        """Test full CSV processing with multiple RADs"""
        test_rows = [
            {
                'radConfig.name': 'AddGEMSubscribers',
                'radContent.id': 'Task-AddGEMSubscribers-gHLTYfjQb',
                'radContent.synthesize.rule': """profile => profile.entities
  .filter(entity => entity.type === 'wsbvnext')
  .map(entity => (
    entityPick(entity, [
      'accountId',
      'entitlementData',
      'gem.subscriberCount',
      'links.addSubscribers'
    ])
  ))"""
            },
            {
                'radConfig.name': 'Task-Upgrade-RemoveAds',
                'radContent.id': 'Task-Upgrade-RemoveAds-ZsVan1Rs~',
                'radContent.synthesize.rule': """profile => {
  const {
    request: {
      query: {
        ventureId,
        appLocation
      } = {}
    } = {}
  } = profile || {};
  
  let tabPath = 'venture/upgrade/plan';

  const entityData = profile.entities
  .filter(entity => entity.type === 'wsbvnext')
  .map(entity => (
    entityPick(entity, [
      'accountId',
      'features.websiteType'
    ])
  ));
  
  return entityData;
}"""
            },
            {
                'radConfig.name': 'EmptyTask',
                'radContent.id': 'Task-Empty-123',
                'radContent.synthesize.rule': """profile => {
  return [];
}"""
            }
        ]
        
        self.create_test_csv(test_rows)
        
        # Run the extraction process
        import subprocess
        result = subprocess.run([
            sys.executable, 
            'graphql-to-mermaid-python.py'
        ], 
        cwd=os.path.dirname(self.csv_file),
        capture_output=True,
        text=True,
        env={**os.environ, 'PYTHONPATH': os.path.dirname(os.path.abspath(__file__))}
        )
        
        # Check that output file was created
        expected_output = os.path.join(os.path.dirname(self.csv_file), 'graphql-queries-simple.md')
        
        # Manually create expected output for comparison
        expected_content = """# RAD Queries

## Task-AddGEMSubscribers-gHLTYfjQb

```javascript
profile => profile.entities
  .filter(entity => entity.type === 'wsbvnext')
  .map(entity => (
    entityPick(entity, [
      'accountId',
      'entitlementData',
      'gem.subscriberCount',
      'links.addSubscribers'
    ])
  ))
```

## Task-Upgrade-RemoveAds-ZsVan1Rs~

```javascript
profile => {
  const {
    request: {
      query: {
        ventureId,
        appLocation
      } = {}
    } = {}
  } = profile || {};
  
  let tabPath = 'venture/upgrade/plan';

  const entityData = profile.entities
  .filter(entity => entity.type === 'wsbvnext')
  .map(entity => (
    entityPick(entity, [
      'accountId',
      'features.websiteType'
    ])
  ));
  
  return entityData;
}
```

## Task-Empty-123

```javascript
profile => {
  return [];
}
```

"""
        
        # Verify the script can handle the test data
        self.assertEqual(result.returncode, 0, f"Script failed: {result.stderr}")
    
    def test_mermaid_formatting(self):
        """Test Mermaid diagram formatting"""
        test_query = """profile => {
  return [];
}"""
        
        formatted = format_graphql_for_mermaid(test_query)
        # Should escape quotes and replace newlines
        self.assertIn('<br/>', formatted)
        self.assertNotIn('\n', formatted)
    
    def test_edge_cases(self):
        """Test edge cases"""
        # Test None/empty input
        self.assertIsNone(extract_pure_graphql(None))
        self.assertIsNone(extract_pure_graphql(''))
        
        # Test query with special characters
        test_query = 'profile => { return ["test\'s", `template`]; }'
        result = extract_pure_graphql(test_query)
        self.assertEqual(result, test_query)
        
        # Test module.exports pattern
        test_query = """module.exports = (profile) => {
  const uceEntity = profile.entities.find(entity => entity.type === 'uce');
  return [];
};"""
        result = extract_pure_graphql(test_query)
        self.assertEqual(result.strip(), test_query.strip())

    def test_sample_rads_from_output(self):
        """Test specific RADs from the actual output to ensure consistency"""
        test_cases = [
            # Test case 1: Simple entityPick
            {
                'id': 'Task-AddGEMSubscribers-gHLTYfjQb',
                'query': """profile => profile.entities
  .filter(entity => entity.type === 'wsbvnext')
  .map(entity => (
    entityPick(entity, [
      'accountId',
      'entitlementData',
      'gem.subscriberCount',
      'links.addSubscribers'
    ])
  ))"""
            },
            # Test case 2: Complex with conditional logic
            {
                'id': 'Task-PoyntSetup-sGURMs9~y',
                'query': """(profile) => {
   const uceEntity = profile.entities.find(entity => entity.type === 'uce');

  const siteWithCommerce = profile.entities.find(
    ({
      type = '',
      id = '',
      entitlementData: {
        current: {
          ucc
        } = {}
      } = {}
    }) => {
      const ols = uceEntity?.features?.ols;
      const status = ols?.status;
      const isProvisioned = id && status && status !== 'NOT_PROVISIONED';
      return type === 'wsbvnext' && isProvisioned
    }
  );
 
 
  if(siteWithCommerce) {
    const {
      features: {
        payments: {
          metadata: {
            processing_account: {
              businessId,
              paymentsEnabled,
              riskDecision,
              applicationStatus
            } = {}
          } = {}
        } = {}
      } = {}
    } = uceEntity || {};
    
    const isCompleted = !!(
      businessId ||
      paymentsEnabled ||
      (riskDecision && riskDecision !== "PENDING") ||
      (applicationStatus && applicationStatus !== "INCOMPLETE")
    );

  	return [{
      id: siteWithCommerce.id,
      type: siteWithCommerce.type,
      poyntLink: siteWithCommerce.links?.poyntSetup,
      isCompleted
    }]
  }

  return []
};"""
            },
            # Test case 3: JoinEntities pattern
            {
                'id': 'Task-DoPostToFacebook-Composer-6vaOpXKQY',
                'query': """profile => {
  const {
    request: {
      query: {
        appLocation,
        ventureId
      } = {}
    } = {}
  } = profile || {};

  const mktgasst = profile.entities
    .filter(entity => entity.type === 'mktgasst')
    .map(entity => (
      entityPick(entity, [
        'id',
        'type'
      ])
    ));

  const wsbVnext = profile.entities
    .filter(entity => entity.type === 'wsbvnext')
    .map(entity => (
      entityPick(entity, [
        'accountId',
        'entitlementData.current',
        'type',
        'gem.lastIgPostDate',
        'gem.lastFbPostDate',
        'features.planType'
      ])
    ));
  
  const entities = joinEntities(mktgasst, wsbVnext, (a, b) => (
    a.type === 'mktgasst' && b.type === 'wsbvnext' && a.id === b.accountId
  ));

  if (appLocation === 'uvh-dashboard' && ventureId && ventureId !== 'undefined') {
    return [{
      ...entities[0],
      appLocation,
      path: `/venture/composer/fb/website?ventureId=${ventureId}`,
      ventureId
    }];
  }

  return [{
    ...entities[0],
    appLocation,
    path: `/account/${entities[0].wsbvnext.accountId}/composer/fb/website`
  }];
}"""
            }
        ]
        
        for test_case in test_cases:
            result = extract_pure_graphql(test_case['query'])
            self.assertEqual(result.strip(), test_case['query'].strip(), 
                           f"Failed for RAD: {test_case['id']}")

if __name__ == '__main__':
    # Run tests
    unittest.main(verbosity=2)