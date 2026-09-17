# Expense Tracker — Separated Backend & Frontend

This project is split into two independent folders so you can work on them
separately:

```
expense-tracker/
├── backend/     Flask REST API + PostgreSQL (no server-rendered pages)
└── frontend/    React + Vite single-page app
```

The backend is now **API-only** — every page that used to be rendered with
Jinja templates (dashboard, transactions, income, budgets, categories,
profile, settings, statements) has been removed. All of that UI lives in
`frontend/`, which talks to the backend exclusively through JSON endpoints
under `/api/...`, plus three file-download endpoints:

- `GET /reports/export.xlsx`
- `GET /statements/monthly/pdf`
- `GET /statements/range/pdf`
- `GET /statements/yearly/pdf`

## What's new in this version

**Change password** — a new `POST /api/change-password` endpoint plus a
Security card on the **Settings** page. It asks for the current password,
verifies it server-side, enforces the password rules below, and rotates the
session cookie so any previously issued cookie value is invalidated. The UI
has show/hide toggles, a live strength meter, and a checklist that updates
as you type.

Password rules (enforced identically on the client and the server):

- at least 8 characters, at most 128
- at least one letter and at least one number
- no leading or trailing spaces
- must differ from the current password

**Redesigned dashboard** — `GET /api/dashboard` now returns pre-computed
analytics (`insights`, `trend`, `budget_status`, `month_category_totals`,
`recent`) so the UI does no heavy maths in the browser. The page now shows:

- month-to-date spend and income with month-over-month change indicators
- average daily spend, projected month-end total, savings rate, transaction count
- a six-month income-vs-expense bar chart and a category donut that toggles
  between this month and all time (both plain inline SVG — no chart library)
- budget health with safe / close / over states and an over-budget alert
- a combined recent-activity feed showing income and expenses together

**Bug fix** — budgets are monthly, but the old dashboard compared them against
*all-time* category spending, so every budget looked overspent after a while.
Budgets are now compared against the spending of the month they belong to.

## 1. Backend setup (`backend/`)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` and set `DATABASE_URL` (PostgreSQL) and a random `FLASK_SECRET_KEY`.
Then start the API:

```powershell
python app.py
```

The API runs at `http://127.0.0.1:5000` by default and creates its tables
automatically on first run.

**Creating your first account:** there is no longer a `/register` page —
create the initial user directly against the API, for example with curl:

```bash
curl -X POST http://127.0.0.1:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ChangeMe123"}'
```

(Only one account can exist; subsequent calls will return an error telling
you to log in instead. The password must satisfy the rules listed above.
Once you are logged in, change it from **Settings → Change Password**.)

Windows users can also just double-click `backend/start_backend.bat`, which
creates the venv, installs dependencies, and starts the server.

## 2. Frontend setup (`frontend/`)

```powershell
cd frontend
npm install
npm run dev
```

The dev server runs at `http://127.0.0.1:5173` and proxies `/api`,
`/static`, `/statements`, and `/reports` to the backend at
`http://127.0.0.1:5000` (see `frontend/vite.config.js`). Run the backend
first, then the frontend.

Windows users can double-click `frontend/start_frontend.bat`.

For production, `npm run build` produces static files in `frontend/dist/`
that you can serve from any static host or reverse-proxy in front of the
Flask API.

## Notes

- Both halves can now be deployed, versioned, and iterated on completely
  independently — the backend has no knowledge of React, and the frontend
  has no knowledge of Flask internals, only the JSON contract above.
- Uploaded receipts are stored in `backend/static/uploads/` and served at
  `/static/uploads/<file>` by the backend.
