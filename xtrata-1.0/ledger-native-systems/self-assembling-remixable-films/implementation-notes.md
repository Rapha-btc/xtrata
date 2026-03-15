# Implementation Notes

## Minimal prototype slice

- model a short film as scenes plus an edit-decision manifest
- publish two alternate cuts that reuse the same scenes
- compare the cuts in a viewer that highlights changed segments

## Notes for future development

- keep heavy media payloads separate from light timeline objects
- treat edit decisions as reusable graph objects, not one-off metadata
- start with short-form media where end-to-end reconstruction is tractable

## Possible first integrations

- Xtrata-like recursive manifests for cuts and layered timeline references
- Stacks licensing contracts for scene packs, soundtrack cues, and edition rights
