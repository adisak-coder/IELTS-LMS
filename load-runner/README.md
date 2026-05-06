# Standalone Load Runner

Deploy this folder as a separate Railway/Leapcell service.

## Local

```bash
cd load-runner
npm install
npm run ui
```

Open `http://localhost:3366`.

## Railway

- Root directory: `load-runner`
- Build command: `npm install`
- Start command: `npm run ui`
- Port: `3366` (or use Railway `PORT` env)

Required in UI when starting browser tests:
- `Register URL`
- `Users File` (default `e2e/prod-load/live-users.500.csv`)

Use mode selector:
- headed test
- headless test
- hybrid (browser + k6)
- k6 test
