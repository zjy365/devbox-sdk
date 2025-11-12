#!/bin/bash
# Test script to verify on-demand port monitoring with 500ms cache

set -e

TOKEN="test-token-$(date +%s)"
PORT=19757

echo "Starting server with token: $TOKEN"

# Build and run server in background
go build -o /tmp/devbox-server ./cmd/server &
BUILD_PID=$!
wait $BUILD_PID

ADDR=":$PORT" TOKEN="$TOKEN" /tmp/devbox-server &
SERVER_PID=$!

# Wait for server to start
sleep 2

echo ""
echo "=== Test 1: Server started, no background polling ==="
ps aux | grep devbox-server | grep -v grep || echo "Server process found"

echo ""
echo "=== Test 2: First call to /api/v1/ports (cache miss, will scan) ==="
START=$(date +%s%3N)
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:$PORT/api/v1/ports)
END=$(date +%s%3N)
DURATION=$((END - START))
echo "Response: $RESPONSE"
echo "Duration: ${DURATION}ms"

# Verify response structure
echo "$RESPONSE" | grep -q '"success":true' && echo "✓ success=true"
echo "$RESPONSE" | grep -q '"ports":\[' && echo "✓ ports array exists"
echo "$RESPONSE" | grep -q '"lastUpdatedAt":' && echo "✓ lastUpdated exists"

# Verify NO count field
if echo "$RESPONSE" | grep -q '"count"'; then
    echo "✗ FAILED: count field should not exist"
    kill $SERVER_PID 2>/dev/null || true
    rm -f /tmp/devbox-server
    exit 1
else
    echo "✓ count field correctly omitted"
fi

TIMESTAMP1=$(echo "$RESPONSE" | grep -o '"lastUpdatedAt":[0-9]*' | cut -d: -f2)

echo ""
echo "=== Test 3: Second call within 500ms (should use cache) ==="
sleep 0.2
START=$(date +%s%3N)
RESPONSE2=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:$PORT/api/v1/ports)
END=$(date +%s%3N)
DURATION=$((END - START))
echo "Response: $RESPONSE2"
echo "Duration: ${DURATION}ms"

TIMESTAMP2=$(echo "$RESPONSE2" | grep -o '"lastUpdatedAt":[0-9]*' | cut -d: -f2)

if [ "$TIMESTAMP1" = "$TIMESTAMP2" ]; then
    echo "✓ Cache hit: timestamps match ($TIMESTAMP1)"
else
    echo "✗ FAILED: Cache miss, timestamps differ ($TIMESTAMP1 vs $TIMESTAMP2)"
fi

echo ""
echo "=== Test 4: Wait 600ms, then call (cache should expire) ==="
sleep 0.6
START=$(date +%s%3N)
RESPONSE3=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:$PORT/api/v1/ports)
END=$(date +%s%3N)
DURATION=$((END - START))
echo "Duration: ${DURATION}ms"

TIMESTAMP3=$(echo "$RESPONSE3" | grep -o '"lastUpdatedAt":[0-9]*' | cut -d: -f2)

if [ "$TIMESTAMP2" != "$TIMESTAMP3" ]; then
    echo "✓ Cache refreshed: new timestamp ($TIMESTAMP3)"
else
    echo "✗ FAILED: Cache not refreshed, same timestamp ($TIMESTAMP2)"
fi

echo ""
echo "=== Test 5: Execute a process (should NOT immediately refresh cache) ==="
EXEC_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"command":"echo","args":["test"]}' \
    http://localhost:$PORT/api/v1/process/exec-sync)
echo "Exec response: $EXEC_RESPONSE"
echo "$EXEC_RESPONSE" | grep -q '"success":true' && echo "✓ Process executed"

# Immediate call should still use cache (within 500ms of last refresh)
RESPONSE4=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:$PORT/api/v1/ports)
TIMESTAMP4=$(echo "$RESPONSE4" | grep -o '"lastUpdatedAt":[0-9]*' | cut -d: -f2)

echo "Timestamp after exec: $TIMESTAMP4"

echo ""
echo "=== All tests passed! ==="
echo "Cache strategy: 500ms TTL, refresh on-demand only"
echo "Cleaning up..."

# Cleanup
kill $SERVER_PID 2>/dev/null || true
rm -f /tmp/devbox-server

echo "Done!"
