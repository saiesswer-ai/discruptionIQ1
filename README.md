<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/acbee314-c119-486b-8f25-cf4230d69798

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example` and set `VITE_API_BASE_URL=http://localhost:8000/api/v1`.
   `GEMINI_API_KEY` is not needed for the operational frontend integration.
3. In a second terminal, start the backend from `backend`:
   `python -m uvicorn app.main:app --reload --port 8000`
4. Run the app:
   `npm run dev`

The UI now requires a FastAPI login and uses the returned bearer token for every operational request. Seed credentials and backend setup are documented in [backend/README.md](backend/README.md). The Vite development server runs on port 3000, so configure the backend with `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` (or add your deployed frontend URL).

## Current API coverage

Live reads: dashboard source data (disruptions, orders at risk, inventory, shipments, suppliers, approvals, audit) and the recovery plan lifecycle (generation, simulation, submission, modification request, approval, rejection, and idempotent execution).

The backend does not currently implement notification read/list endpoints or an API reset endpoint. Those views deliberately display an unavailable state rather than mock data.
