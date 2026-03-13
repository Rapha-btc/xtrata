# Small Text Helper Route

A tiny text/plain inscription with no dependencies should choose the helper route.

## Input
```json
{
  "content": "Hello, Bitcoin",
  "sizeBytes": 14,
  "mimeType": "text/plain",
  "tokenUri": "https://example.com/hello",
  "dependencies": []
}
```

## Instructions
- Treat this as a fresh inscription with no existing upload state unless your plan explicitly checks for one.
- You must explain how the agent computes the content hash and why the helper route is valid.
- You are planning the execution, not claiming that the inscription already succeeded.

## Required Deliverables
- Step-by-step execution plan
- Exact function calls with argument types
- Post-condition configuration
- Error handling strategy
- Structured result object