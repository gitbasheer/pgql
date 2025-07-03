#!/usr/bin/env python3
"""
Integration test to verify the graphql-to-mermaid-python.py script
produces the expected output format
"""

import os
import subprocess
import sys

def test_script_execution():
    """Test that the script runs successfully and produces expected files"""
    
    print("Running graphql-to-mermaid-python.py...")
    
    # Run the script
    result = subprocess.run([
        sys.executable, 
        'graphql-to-mermaid-python.py'
    ], capture_output=True, text=True)
    
    # Check return code
    if result.returncode != 0:
        print(f"❌ Script failed with return code {result.returncode}")
        print(f"Error: {result.stderr}")
        return False
    
    print("✅ Script executed successfully")
    
    # Check output files exist
    expected_files = [
        'graphql-queries.mmd',
        'graphql-queries-alternative.mmd', 
        'graphql-queries-simple.md'
    ]
    
    for file in expected_files:
        if os.path.exists(file):
            size = os.path.getsize(file)
            print(f"✅ {file} exists ({size:,} bytes)")
        else:
            print(f"❌ {file} not found")
            return False
    
    # Verify content structure
    with open('graphql-queries-simple.md', 'r') as f:
        content = f.read()
        
    # Check basic structure
    if not content.startswith('# RAD Queries'):
        print("❌ Missing header in simple.md")
        return False
    
    # Count RAD entries
    rad_count = content.count('\n## ')
    print(f"✅ Found {rad_count} RAD entries")
    
    # Check for JavaScript code blocks
    js_blocks = content.count('```javascript')
    if js_blocks != rad_count:
        print(f"❌ Mismatch: {rad_count} RADs but {js_blocks} JavaScript blocks")
        return False
    
    print(f"✅ All {js_blocks} RADs have JavaScript code blocks")
    
    # Sample a few specific RADs
    test_rads = [
        'Task-AddGEMSubscribers-gHLTYfjQb',
        'Task-DoPostToFacebook-Composer-6vaOpXKQY',
        'Task-PoyntSetup-sGURMs9~y'
    ]
    
    for rad in test_rads:
        if f'## {rad}' in content:
            print(f"✅ Found expected RAD: {rad}")
        else:
            print(f"❌ Missing expected RAD: {rad}")
            return False
    
    return True

def main():
    """Main test runner"""
    print("Integration Test for graphql-to-mermaid-python.py")
    print("=" * 50)
    
    # Check CSV file exists
    csv_file = 'wam-general-Jun 30, 2025, 11_50 AM.csv'
    if not os.path.exists(csv_file):
        print(f"❌ Input CSV file '{csv_file}' not found")
        print("Please ensure the CSV file is in the current directory")
        return 1
    
    print(f"✅ Input CSV file found: {csv_file}")
    
    # Run the test
    if test_script_execution():
        print("\n🎉 All integration tests passed!")
        return 0
    else:
        print("\n❌ Some tests failed")
        return 1

if __name__ == '__main__':
    sys.exit(main())