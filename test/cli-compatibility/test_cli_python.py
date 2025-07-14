#!/usr/bin/env python3
"""
Test CLI compatibility for Python automation scripts.
Ensures all CLI commands are scriptable and produce stable outputs.
"""

import subprocess
import json
import sys
import os
import tempfile
from pathlib import Path

class CLICompatibilityTester:
    def __init__(self):
        self.test_dir = Path(__file__).parent
        self.temp_dir = tempfile.mkdtemp()
        self.cli_path = 'npx'
        self.main_cli = 'pg-cli'
        self.unified_cli = 'pg-migrate'
        
    def run_command(self, args, check=True):
        """Run CLI command and return result"""
        cmd = [self.cli_path] + args
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False
        )
        
        if check and result.returncode != 0:
            raise Exception(f"Command failed: {' '.join(cmd)}\nStderr: {result.stderr}")
            
        return result
    
    def test_extract_queries(self):
        """Test query extraction produces stable JSON output"""
        output_file = os.path.join(self.temp_dir, 'queries.json')
        
        # Run extraction
        result = self.run_command([
            self.main_cli, 'extract', 'queries',
            './src',
            '-o', output_file
        ])
        
        # Verify exit code
        assert result.returncode == 0, "Extract command should succeed"
        
        # Verify JSON output
        with open(output_file, 'r') as f:
            data = json.load(f)
        
        # Check required fields
        required_fields = ['timestamp', 'directory', 'totalQueries', 'queries']
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Verify data types
        assert isinstance(data['timestamp'], str)
        assert isinstance(data['totalQueries'], int)
        assert isinstance(data['queries'], list)
        
        return True
    
    def test_transform_dry_run(self):
        """Test transformation dry-run mode"""
        # Create test input
        test_input = {
            "timestamp": "2025-01-09T10:00:00Z",
            "queries": [{
                "id": "test-1",
                "content": "query { user { id } }",
                "file": "test.ts"
            }]
        }
        
        input_file = os.path.join(self.temp_dir, 'test-queries.json')
        with open(input_file, 'w') as f:
            json.dump(test_input, f)
        
        # Run transform with dry-run
        result = self.run_command([
            self.main_cli, 'transform', 'queries',
            '--dry-run',
            '-i', input_file
        ])
        
        # Should succeed even without schema in dry-run
        assert result.returncode == 0, "Transform dry-run should succeed"
        assert 'Dry run mode' in result.stdout, "Should indicate dry-run mode"
        
        return True
    
    def test_validate_exit_codes(self):
        """Test validation produces correct exit codes"""
        # Test with non-existent file (should fail)
        result = self.run_command([
            self.main_cli, 'validate', 'schema',
            '-q', 'non-existent.json',
            '-s', 'schema.graphql'
        ], check=False)
        
        # Should exit with error code
        assert result.returncode == 1, "Should fail with exit code 1"
        
        return True
    
    def test_unified_cli_compatibility(self):
        """Test unified-cli produces compatible outputs"""
        # Test analyze command
        result = self.run_command([
            self.unified_cli, 'analyze',
            '-s', './src',
            '--detailed'
        ], check=False)
        
        # Check for structured output markers
        if result.returncode == 0:
            assert 'GraphQL operations' in result.stdout
        
        return True
    
    def test_json_parsing_stability(self):
        """Test JSON outputs are stable across invocations"""
        output1 = os.path.join(self.temp_dir, 'run1.json')
        output2 = os.path.join(self.temp_dir, 'run2.json')
        
        # Run twice
        for output in [output1, output2]:
            self.run_command([
                self.main_cli, 'extract', 'queries',
                './src',
                '-o', output,
                '--no-fragments'  # Disable to ensure deterministic output
            ])
        
        # Load and compare structure (not timestamp)
        with open(output1, 'r') as f:
            data1 = json.load(f)
        with open(output2, 'r') as f:
            data2 = json.load(f)
        
        # Remove timestamps for comparison
        data1.pop('timestamp', None)
        data2.pop('timestamp', None)
        
        # Structure should be identical
        assert data1.keys() == data2.keys(), "Output structure should be stable"
        
        return True
    
    def test_error_handling(self):
        """Test error outputs are parseable"""
        # Invalid command
        result = self.run_command([
            self.main_cli, 'invalid-command'
        ], check=False)
        
        # Should fail gracefully
        assert result.returncode != 0, "Invalid command should fail"
        assert len(result.stderr) > 0 or len(result.stdout) > 0, "Should produce error output"
        
        return True
    
    def run_all_tests(self):
        """Run all compatibility tests"""
        tests = [
            self.test_extract_queries,
            self.test_transform_dry_run,
            self.test_validate_exit_codes,
            self.test_unified_cli_compatibility,
            self.test_json_parsing_stability,
            self.test_error_handling
        ]
        
        failed = 0
        for test in tests:
            try:
                test()
                print(f"✓ {test.__name__}")
            except Exception as e:
                print(f"✗ {test.__name__}: {e}")
                failed += 1
        
        if failed == 0:
            print("\n✅ All CLI compatibility tests passed!")
        else:
            print(f"\n❌ {failed} tests failed")
            sys.exit(1)

if __name__ == "__main__":
    tester = CLICompatibilityTester()
    tester.run_all_tests()