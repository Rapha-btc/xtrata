# Large HTML Staged Upload

A 600KB HTML file should use begin-or-get, add-chunk-batch, and seal-inscription.

## Input
```json
{
  "sizeBytes": 600000,
  "expectedChunks": 37,
  "mimeType": "text/html",
  "tokenUri": "https://example.com/page",
  "dependencies": []
}
```

## Instructions
- Assume the content is a valid 600KB HTML file.
- Focus on correct chunking, staged route selection, and transaction ordering.
- Explicitly state that the agent waits for each write transaction to confirm before continuing.

## Required Deliverables
- Step-by-step execution plan
- Exact function calls with argument types
- Post-condition configuration
- Error handling strategy
- Structured result object