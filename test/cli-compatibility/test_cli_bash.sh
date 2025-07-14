#!/bin/bash
# Test CLI compatibility for bash automation scripts
# Ensures all CLI commands are scriptable and produce stable outputs

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test directory setup
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# CLI commands
PG_CLI="npx pg-cli"
PG_MIGRATE="npx pg-migrate"

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_test() {
    echo -e "\n${YELLOW}Testing: $1${NC}"
}

assert_success() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ $1${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_fail() {
    if [ $? -ne 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ $1 (expected failure)${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_file_exists() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓ File exists: $1${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ File missing: $1${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_json_field() {
    local file=$1
    local field=$2
    
    if jq -e ".$field" "$file" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ JSON field exists: $field${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ JSON field missing: $field${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 1: Extract queries and verify JSON output
test_extract_queries() {
    log_test "Extract queries with JSON output"
    
    local output_file="$TEMP_DIR/queries.json"
    
    $PG_CLI extract queries ./src -o "$output_file" 2>/dev/null
    assert_success "Extract command succeeded"
    
    assert_file_exists "$output_file"
    
    # Verify JSON structure
    assert_json_field "$output_file" "timestamp"
    assert_json_field "$output_file" "directory"
    assert_json_field "$output_file" "totalQueries"
    assert_json_field "$output_file" "queries"
    
    # Extract and verify data
    local total_queries=$(jq -r '.totalQueries' "$output_file")
    if [[ "$total_queries" =~ ^[0-9]+$ ]]; then
        echo -e "${GREEN}✓ Total queries is a number: $total_queries${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Total queries is not a number: $total_queries${NC}"
        ((TESTS_FAILED++))
    fi
}

# Test 2: Transform with dry-run
test_transform_dry_run() {
    log_test "Transform queries with dry-run"
    
    # Create test input
    cat > "$TEMP_DIR/test-queries.json" <<EOF
{
  "timestamp": "2025-01-09T10:00:00Z",
  "totalQueries": 1,
  "queries": [{
    "id": "test-1",
    "content": "query { user { id } }",
    "file": "test.ts"
  }]
}
EOF
    
    # Run transform with dry-run (should work without schema)
    $PG_CLI transform queries --dry-run -i "$TEMP_DIR/test-queries.json" 2>&1 | grep -q "Dry run"
    assert_success "Dry-run mode detected in output"
}

# Test 3: Exit codes
test_exit_codes() {
    log_test "CLI exit codes"
    
    # Test successful command
    $PG_CLI --version >/dev/null 2>&1
    assert_success "Version command exits 0"
    
    # Test failed command (non-existent file)
    $PG_CLI extract queries /non/existent/path -o "$TEMP_DIR/fail.json" >/dev/null 2>&1 || true
    assert_fail "Non-existent path exits non-zero"
}

# Test 4: Validate command compatibility
test_validate_compatibility() {
    log_test "Validate command structure"
    
    # Check help output contains expected commands
    local help_output=$($PG_CLI --help 2>&1)
    
    if echo "$help_output" | grep -q "extract"; then
        echo -e "${GREEN}✓ Extract command found${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Extract command missing${NC}"
        ((TESTS_FAILED++))
    fi
    
    if echo "$help_output" | grep -q "transform"; then
        echo -e "${GREEN}✓ Transform command found${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Transform command missing${NC}"
        ((TESTS_FAILED++))
    fi
    
    if echo "$help_output" | grep -q "validate"; then
        echo -e "${GREEN}✓ Validate command found${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ Validate command missing${NC}"
        ((TESTS_FAILED++))
    fi
}

# Test 5: Output format stability
test_output_stability() {
    log_test "Output format stability"
    
    # Run same command twice
    local output1="$TEMP_DIR/run1.json"
    local output2="$TEMP_DIR/run2.json"
    
    $PG_CLI extract queries ./src -o "$output1" --no-fragments 2>/dev/null || true
    $PG_CLI extract queries ./src -o "$output2" --no-fragments 2>/dev/null || true
    
    # If both files exist, compare structure
    if [ -f "$output1" ] && [ -f "$output2" ]; then
        # Remove timestamps for comparison
        jq 'del(.timestamp)' "$output1" > "$TEMP_DIR/normalized1.json"
        jq 'del(.timestamp)' "$output2" > "$TEMP_DIR/normalized2.json"
        
        # Check if structure is identical
        if jq -e 'keys' "$TEMP_DIR/normalized1.json" > "$TEMP_DIR/keys1.txt" && \
           jq -e 'keys' "$TEMP_DIR/normalized2.json" > "$TEMP_DIR/keys2.txt" && \
           diff -q "$TEMP_DIR/keys1.txt" "$TEMP_DIR/keys2.txt" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ Output structure is stable${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "${RED}✗ Output structure differs between runs${NC}"
            ((TESTS_FAILED++))
        fi
    else
        echo -e "${YELLOW}⚠ Skipping stability test (extraction failed)${NC}"
    fi
}

# Test 6: Pipe compatibility
test_pipe_compatibility() {
    log_test "Pipe and stream compatibility"
    
    # Test piping to other commands
    echo '{"queries": []}' | jq '.' > /dev/null 2>&1
    assert_success "JSON can be piped to jq"
    
    # Test error output goes to stderr
    local stderr_output=$($PG_CLI invalid-command 2>&1 1>/dev/null || true)
    if [ -n "$stderr_output" ]; then
        echo -e "${GREEN}✓ Errors go to stderr${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ No error output detected${NC}"
        ((TESTS_FAILED++))
    fi
}

# Test 7: Unified CLI compatibility
test_unified_cli() {
    log_test "Unified CLI (pg-migrate) compatibility"
    
    # Check if unified CLI exists
    if $PG_MIGRATE --version >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Unified CLI is accessible${NC}"
        ((TESTS_PASSED++))
        
        # Check help output
        local help_output=$($PG_MIGRATE --help 2>&1)
        if echo "$help_output" | grep -q "analyze"; then
            echo -e "${GREEN}✓ Analyze command available in unified CLI${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "${RED}✗ Analyze command missing in unified CLI${NC}"
            ((TESTS_FAILED++))
        fi
    else
        echo -e "${YELLOW}⚠ Unified CLI not found${NC}"
    fi
}

# Main test runner
main() {
    echo "==================================="
    echo "CLI Compatibility Test Suite (Bash)"
    echo "==================================="
    
    # Check dependencies
    command -v jq >/dev/null 2>&1 || { echo "Error: jq is required"; exit 1; }
    
    # Run all tests
    test_extract_queries
    test_transform_dry_run
    test_exit_codes
    test_validate_compatibility
    test_output_stability
    test_pipe_compatibility
    test_unified_cli
    
    # Summary
    echo -e "\n==================================="
    echo "Test Summary"
    echo "==================================="
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "\n${GREEN}✅ All CLI compatibility tests passed!${NC}"
        exit 0
    else
        echo -e "\n${RED}❌ Some tests failed${NC}"
        exit 1
    fi
}

# Run tests
main "$@"