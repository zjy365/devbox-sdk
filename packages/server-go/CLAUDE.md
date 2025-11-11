# What is devbox-sdk server-go

A lightweight, production-ready Go server designed for local development environments. It provides comprehensive capabilities for file operations, process management, interactive shell sessions, real-time WebSocket communication, and health monitoring. The server follows a clean architecture with no Docker dependencies and minimal configuration requirements.

# Architecture

## Request Flow

```
HTTP Request
    ↓
Middleware Stack (CORS, Auth, Logging)
    ↓
Router (Pattern matching)
    ↓
Handler (File/Process/Session/WebSocket)
    ↓
Business Logic
    ↓
Response Builder (JSON)
    ↓
HTTP Response
```

# Code style

- Follow Go conventions and existing patterns in the codebase
- Use appropriate error handling with proper error wrapping
- Do not write comments that are obvious from the code itself; focus on explaining why something is done, not what it does
- Seriously, do not write comments that are obvious from the code itself.
- Do not write one-line functions
- when wrting any code and/or doc, always output english

# Workflow

- Take a careful look at Makefile to understand what commands should be run at different points in the project lifecycle
- After making code changes, first run `make fmt vet lint`
- Then, run unit tests and a couple of relevant integration tests to verify your changes
  - Don't run tests manually using `go test` unless instructed to do so
  - If tests are failing that are unrelated to your changes, let me know and stop working.
- Do not run any write operations with `git`
- Make a tmp directory (`mktemp`) for testing things out if needed and don't forget to cleaning it up
- if changed any route or handler, update the OpenAPI spec accordingly

# Test
- Unit tests should cover all business logic and edge cases
- Integration tests is under test folder and should simulate real-world scenarios and validate end-to-end functionality
