#!/bin/bash

# Integration test for file move and rename operations

set -e

BASE_URL="http://localhost:9757"
TOKEN="${TOKEN:-8sfvf74y}"
WORKSPACE="${WORKSPACE:-/workspace}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Testing File Move and Rename Operations"
echo "========================================"

# Helper function to make API calls
api_call() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    curl -s -X "$method" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$data" \
        "${BASE_URL}${endpoint}"
}

# Test 1: Create test file
echo -e "\n${GREEN}Test 1: Creating test file${NC}"
RESPONSE=$(api_call POST "/api/v1/files/write" '{"path":"'"$WORKSPACE"'/test_move.txt","content":"Test content for move operation"}')
echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Test file created successfully${NC}"
else
    echo -e "${RED}✗ Failed to create test file${NC}"
    exit 1
fi

# Test 2: Move file to new location
echo -e "\n${GREEN}Test 2: Moving file${NC}"
RESPONSE=$(api_call POST "/api/v1/files/move" '{"source":"'"$WORKSPACE"'/test_move.txt","destination":"'"$WORKSPACE"'/test_moved.txt"}')
echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ File moved successfully${NC}"
else
    echo -e "${RED}✗ Failed to move file${NC}"
    exit 1
fi

# Test 3: Verify source file no longer exists
echo -e "\n${GREEN}Test 3: Verifying source file deleted${NC}"
RESPONSE=$(api_call GET "/api/v1/files/read?path=$WORKSPACE/test_move.txt")
if echo "$RESPONSE" | grep -q '"error_type":"file_not_found"' || echo "$RESPONSE" | grep -q '"error"'; then
    echo -e "${GREEN}✓ Source file correctly deleted${NC}"
else
    echo -e "${RED}✗ Source file still exists${NC}"
    exit 1
fi

# Test 4: Verify destination file exists
echo -e "\n${GREEN}Test 4: Verifying destination file exists${NC}"
RESPONSE=$(api_call GET "/api/v1/files/read?path=$WORKSPACE/test_moved.txt")
if echo "$RESPONSE" | grep -q '"success":true' && echo "$RESPONSE" | grep -q "Test content for move operation"; then
    echo -e "${GREEN}✓ Destination file exists with correct content${NC}"
else
    echo -e "${RED}✗ Destination file not found or content incorrect${NC}"
    exit 1
fi

# Test 5: Rename file
echo -e "\n${GREEN}Test 5: Renaming file${NC}"
RESPONSE=$(api_call POST "/api/v1/files/rename" '{"oldPath":"'"$WORKSPACE"'/test_moved.txt","newPath":"'"$WORKSPACE"'/test_renamed.txt"}')
echo "Response: $RESPONSE"
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ File renamed successfully${NC}"
else
    echo -e "${RED}✗ Failed to rename file${NC}"
    exit 1
fi

# Test 6: Verify renamed file exists
echo -e "\n${GREEN}Test 6: Verifying renamed file exists${NC}"
RESPONSE=$(api_call GET "/api/v1/files/read?path=$WORKSPACE/test_renamed.txt")
if echo "$RESPONSE" | grep -q '"success":true' && echo "$RESPONSE" | grep -q "Test content for move operation"; then
    echo -e "${GREEN}✓ Renamed file exists with correct content${NC}"
else
    echo -e "${RED}✗ Renamed file not found or content incorrect${NC}"
    exit 1
fi

# Test 7: Test move with overwrite
echo -e "\n${GREEN}Test 7: Testing move with overwrite${NC}"
# Create a new file
api_call POST "/api/v1/files/write" '{"path":"'"$WORKSPACE"'/test_overwrite_source.txt","content":"Source content"}' > /dev/null
# Create destination file
api_call POST "/api/v1/files/write" '{"path":"'"$WORKSPACE"'/test_overwrite_dest.txt","content":"Destination content"}' > /dev/null
# Try move without overwrite (should fail)
RESPONSE=$(api_call POST "/api/v1/files/move" '{"source":"'"$WORKSPACE"'/test_overwrite_source.txt","destination":"'"$WORKSPACE"'/test_overwrite_dest.txt","overwrite":false}')
if echo "$RESPONSE" | grep -q '"error"'; then
    echo -e "${GREEN}✓ Move without overwrite correctly failed${NC}"
else
    echo -e "${RED}✗ Move without overwrite should have failed${NC}"
    exit 1
fi

# Try move with overwrite (should succeed)
RESPONSE=$(api_call POST "/api/v1/files/move" '{"source":"'"$WORKSPACE"'/test_overwrite_source.txt","destination":"'"$WORKSPACE"'/test_overwrite_dest.txt","overwrite":true}')
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Move with overwrite succeeded${NC}"
else
    echo -e "${RED}✗ Move with overwrite failed${NC}"
    exit 1
fi

# Test 8: Test rename with existing destination (should fail)
echo -e "\n${GREEN}Test 8: Testing rename with existing destination${NC}"
api_call POST "/api/v1/files/write" '{"path":"'"$WORKSPACE"'/test_rename_exist1.txt","content":"File 1"}' > /dev/null
api_call POST "/api/v1/files/write" '{"path":"'"$WORKSPACE"'/test_rename_exist2.txt","content":"File 2"}' > /dev/null
RESPONSE=$(api_call POST "/api/v1/files/rename" '{"oldPath":"'"$WORKSPACE"'/test_rename_exist1.txt","newPath":"'"$WORKSPACE"'/test_rename_exist2.txt"}')
if echo "$RESPONSE" | grep -q '"error"'; then
    echo -e "${GREEN}✓ Rename to existing path correctly failed${NC}"
else
    echo -e "${RED}✗ Rename to existing path should have failed${NC}"
    exit 1
fi

# Cleanup
echo -e "\n${GREEN}Cleaning up test files${NC}"
api_call POST "/api/v1/files/delete" '{"path":"'"$WORKSPACE"'/test_renamed.txt"}' > /dev/null
api_call POST "/api/v1/files/delete" '{"path":"'"$WORKSPACE"'/test_overwrite_dest.txt"}' > /dev/null
api_call POST "/api/v1/files/delete" '{"path":"'"$WORKSPACE"'/test_rename_exist1.txt"}' > /dev/null
api_call POST "/api/v1/files/delete" '{"path":"'"$WORKSPACE"'/test_rename_exist2.txt"}' > /dev/null

echo -e "\n${GREEN}========================================"
echo "All tests passed!"
echo -e "========================================${NC}"
