#!/bin/bash
# Test Health Check Script
# Detects common test issues in the ClosedClaw codebase

set -e

echo "=== ClosedClaw Test Health Check ==="
echo ""

cd "$(dirname "$0")/.."

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check and report
check_issue() {
  local description=$1
  local pattern=$2
  local files=$3
  local expected=$4
  
  count=$(grep -r "$pattern" --include="*.test.ts" $files 2>/dev/null | wc -l)
  
  if [ "$count" -eq "$expected" ]; then
    echo -e "${GREEN}✓${NC} $description: $count (expected)"
  elif [ "$count" -gt "$expected" ]; then
    echo -e "${RED}✗${NC} $description: $count (expected $expected)"
    grep -r "$pattern" --include="*.test.ts" $files 2>/dev/null | head -5
  else
    echo -e "${YELLOW}?${NC} $description: $count (expected $expected)"
  fi
}

echo "--- Duplicate Mock Issues ---"
check_issue "Absolute path mocks" 'vi.mock("/src/' "src/" 0
check_issue "Duplicate pi-embedded mocks" 'vi.mock.*pi-embedded.*pi-embedded' "src/" 0

echo ""
echo "--- Import Issues ---"
check_issue "Imports from archived /web/ path" 'from.*["\x27]\.\.*/web/' "src/" 1
check_issue "Imports from archive directory" 'from.*["\x27].*archive/' "src/" 1

echo ""
echo "--- Variable Issues ---"
echo "Note: Checking for _result patterns (may have false positives)"
unused_result=$(grep -r "const _result\|let _result" --include="*.test.ts" src/ 2>/dev/null | wc -l)
echo "  Unused _result declarations: $unused_result"

echo ""
echo "--- Test File Stats ---"
total_tests=$(find src extensions test -name "*.test.ts" 2>/dev/null | wc -l)
archived_tests=$(find archive -name "*.test.ts" 2>/dev/null | wc -l)
echo "  Active test files: $total_tests"
echo "  Archived test files: $archived_tests"

echo ""
echo "--- Mock Patterns ---"
pi_embedded_mocks=$(grep -r "vi.mock.*pi-embedded" --include="*.test.ts" src/ 2>/dev/null | wc -l)
echo "  Tests mocking pi-embedded: $pi_embedded_mocks"

echo ""
echo "=== Run 'pnpm test 2>&1 | tee test-output.txt' to see actual failures ==="
