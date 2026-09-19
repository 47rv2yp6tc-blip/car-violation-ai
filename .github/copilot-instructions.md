# Car AI Copilot Instructions

## Project
RoadLens AI is a small static frontend plus a Vercel serverless `/api/analyze` endpoint for evidence-first traffic image analysis.

## Development
- Install with `npm ci` or `npm install`.
- Run `npm test` for regression tests.
- Run `npm run build` for the syntax/build check.
- The deployed frontend entry is root `index.html`; `car-ai` is a legacy draft.

## Gemini and security
- Gemini is used only for image understanding and suspected violation evidence.
- Do not add unnecessary Gemini requests, automatic loops, or unbounded retries.
- Never put `GEMINI_API_KEY` in HTML, frontend JavaScript, CSS, git, or public assets. Read it only from Vercel Environment Variables.
- Fine amounts must come from `data/penalty-rules.json` and the rule calculation code, never from model output.
- Keep AI confidence separate from legal certainty; uncertain evidence must remain uncertain and be reviewable by the user.

## Deployment
Vercel uses the repository root as the static output directory and `api/analyze.js` as the serverless function. Keep `GEMINI_API_KEY` configured in Vercel and redeploy after runtime changes.

## Change policy
Preserve the existing simple architecture. Do not add a framework, database, model, or multi-image feature unless explicitly required. Avoid changing a working Gemini request contract without a regression test.
