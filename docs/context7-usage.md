# Context7 Usage

Context7 is installed as the `ctx7` dev dependency and exposed through:

```bash
npm run context7 -- --help
```

Use it when implementing or configuring fast-moving third-party APIs:

- Supabase JS, Auth, and Edge Functions
- Sentry React and FastAPI SDKs
- Storybook React/Vite configuration
- Vite, React Router, and Vitest
- OpenAI, Anthropic, Gemini, and DeepSeek SDK behavior

Examples:

```bash
npm run context7 -- library react "error boundaries"
npm run context7 -- docs /getsentry/sentry-javascript "react vite setup"
npm run context7 -- docs /storybookjs/storybook "react vite stories"
```

Do not use Context7 output as a replacement for local verification. Treat it as current documentation context, then run the repo's tests and builds.
