# Hookwatch

Hookwatch is a local webhook debugger for receiving payloads, inspecting headers and bodies, and replaying events to downstream targets.

## Features
- Ingest webhooks on `/ingest/:source` with any HTTP method.
- Inspect event history, request metadata, and payloads.
- Filter events by source and full-text search.
- Replay events to any target URL.
- Light and dark themes powered by centralized design tokens.

## Stack
- Server: Fastify + TypeScript
- UI: React + Vite + TypeScript
- Tests: Vitest + React Testing Library

## Quick start
```bash
npm install
npm run dev
```

Default ports:
- API: `http://127.0.0.1:8899`
- UI: `http://127.0.0.1:5188`

## Send a test webhook
```bash
curl -X POST http://127.0.0.1:8899/ingest/github \
  -H "content-type: application/json" \
  -d '{"event":"push","repository":"hookwatch"}'
```

## Scripts
- `npm run dev` - Run server and web in development.
- `npm run build` - Build web and server artifacts.
- `npm run test` - Run web and server test suites.

## Testing
- Server tests cover ingest, list/filter, and replay flow.
- Web tests cover loading, filtering, and replay interaction.

## License
MIT
