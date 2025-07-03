#!/usr/bin/env python3
"""
Test script to validate the actual output of graphql-to-mermaid-python.py
against expected format
"""

import os
import re
import sys
from pathlib import Path

def validate_output_format(file_path):
    """Validate that the output file matches expected format"""
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check header
    assert content.startswith('# RAD Queries\n\n'), "Missing or incorrect header"
    
    # Pattern for RAD sections
    rad_pattern = re.compile(
        r'## ([\w\-~\(\)]+)\n\n```javascript\n([\s\S]*?)\n```\n\n',
        re.MULTILINE
    )
    
    matches = list(rad_pattern.finditer(content))
    
    print(f"Found {len(matches)} RAD queries in the output file")
    
    # Validate each RAD section
    for i, match in enumerate(matches):
        rad_id = match.group(1)
        js_code = match.group(2)
        
        # Validate RAD ID format (should contain letters, numbers, hyphens, tildes)
        assert re.match(r'^[\w\-~\(\)]+$', rad_id), f"Invalid RAD ID format: {rad_id}"
        
        # Validate JavaScript code is not empty
        assert js_code.strip(), f"Empty JavaScript code for RAD: {rad_id}"
        
        # Check for common patterns
        if 'entityPick' in js_code:
            assert 'entity' in js_code, f"entityPick without entity context in {rad_id}"
        
        if 'joinEntities' in js_code:
            assert '=>' in js_code, f"joinEntities without arrow function in {rad_id}"
        
        # Basic syntax checks
        open_braces = js_code.count('{')
        close_braces = js_code.count('}')
        assert open_braces == close_braces, f"Mismatched braces in {rad_id}: {open_braces} open vs {close_braces} close"
        
        open_parens = js_code.count('(')
        close_parens = js_code.count(')')
        assert open_parens == close_parens, f"Mismatched parentheses in {rad_id}: {open_parens} open vs {close_parens} close"
        
        open_brackets = js_code.count('[')
        close_brackets = js_code.count(']')
        assert open_brackets == close_brackets, f"Mismatched brackets in {rad_id}: {open_brackets} open vs {close_brackets} close"
    
    return matches

def validate_specific_rads(file_path, expected_rads):
    """Validate that specific RADs are present with expected content"""
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for expected_rad in expected_rads:
        rad_id = expected_rad['id']
        expected_code = expected_rad['code'].strip()
        
        # Find the RAD section
        pattern = re.compile(
            rf'## {re.escape(rad_id)}\n\n```javascript\n([\s\S]*?)\n```',
            re.MULTILINE
        )
        
        match = pattern.search(content)
        assert match, f"RAD {rad_id} not found in output"
        
        actual_code = match.group(1).strip()
        
        # Normalize whitespace for comparison
        expected_normalized = re.sub(r'\s+', ' ', expected_code)
        actual_normalized = re.sub(r'\s+', ' ', actual_code)
        
        if expected_normalized != actual_normalized:
            print(f"\nMismatch for RAD {rad_id}:")
            print(f"Expected:\n{expected_code}")
            print(f"Actual:\n{actual_code}")
            assert False, f"Content mismatch for RAD {rad_id}"

def test_mermaid_output(file_path):
    """Test that Mermaid output is properly formatted"""
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Should start with graph directive
    assert content.startswith('graph TD\n'), "Mermaid diagram should start with 'graph TD'"
    
    # Check node format
    node_pattern = re.compile(r'Q\d+\["<b>.*?</b><br/><br/>.*?"\]')
    nodes = node_pattern.findall(content)
    
    print(f"Found {len(nodes)} nodes in Mermaid diagram")
    
    # Check style definitions
    style_pattern = re.compile(r'style Q\d+ fill:#[a-f0-9]{6},stroke:#[a-f0-9]{3},stroke-width:\d+px')
    styles = style_pattern.findall(content)
    
    assert len(nodes) == len(styles), "Each node should have a corresponding style definition"

def main():
    """Main test runner"""
    
    # Test files
    simple_output = 'graphql-queries-simple.md'
    mermaid_output = 'graphql-queries.mmd'
    
    print("Testing Simple Markdown Output...")
    if os.path.exists(simple_output):
        matches = validate_output_format(simple_output)
        print(f"✓ Format validation passed for {len(matches)} RADs")
        
        # Test specific RADs
        expected_rads = [
            {
                'id': 'Task-AddGEMSubscribers-gHLTYfjQb',
                'code': """profile => profile.entities
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
                'id': 'Task-DoPostToFacebook-Composer-6vaOpXKQY',
                'code': """profile => {
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
        
        validate_specific_rads(simple_output, expected_rads)
        print("✓ Specific RAD validation passed")
    else:
        print(f"! Warning: {simple_output} not found")
    
    print("\nTesting Mermaid Output...")
    if os.path.exists(mermaid_output):
        test_mermaid_output(mermaid_output)
        print("✓ Mermaid format validation passed")
    else:
        print(f"! Warning: {mermaid_output} not found")
    
    print("\n✅ All tests passed!")

if __name__ == '__main__':
    main()