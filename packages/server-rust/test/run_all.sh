#!/bin/bash
set -e

echo "Running all tests..."

echo ">>> Running test_all_routes.sh"
bash test/test_all_routes.sh

echo ">>> Running test_lazy_port_monitor.sh"
bash test/test_lazy_port_monitor.sh

echo ">>> Running test_exec_sync.sh"
bash test/test_exec_sync.sh

echo ">>> Running test_error_handling_behavior.sh"
bash test/test_error_handling_behavior.sh

echo ">>> Running test_file_move_rename.sh"
bash test/test_file_move_rename.sh

echo ">>> Running test_process_logs.sh"
bash test/test_process_logs.sh

echo ">>> Running test_session_logs.sh"
bash test/test_session_logs.sh

echo "All tests passed successfully!"
