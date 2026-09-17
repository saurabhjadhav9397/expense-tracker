import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard, Receipt, TrendingUp, Wallet, BarChart3, Tags, User,
  Settings, Sun, Moon, Plus, Edit3, Trash2, Eye, EyeOff, Search, Filter, X,
  Check, ArrowUpRight, ArrowDownRight, Target, ShieldCheck, LogOut,
  Download, Paperclip, FileText, ChevronRight, RefreshCw,
  KeyRound, AlertTriangle, PiggyBank, CalendarDays, Activity
} from "lucide-react";
import "./styles.css";

const payments = ["UPI", "Cash", "Debit Card", "Credit Card", "Bank Transfer", "Wallet"];
const fallbackCategories = [
  "Food", "Transport", "Bills", "Shopping", "Travel",
  "Health", "Education", "Entertainment", "Rent", "Other"
];

const today = () => new Date().toISOString().slice(0, 10);

const monthName = (m) =>
  new Date(2000, Number(m) - 1, 1).toLocaleString("en-IN", { month: "long" });

const dateLabel = (v) => {
  if (!v) return "—";
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
};

const emptyFilters = () => ({
  start_date: "",
  end_date: "",
  category: "",
  payment_method: "",
  kind: "all",
  min_amount: "",
  max_amount: ""
});

async function api(url, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}) } };

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    typeof options.body !== "string"
  ) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, opts);
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : {};

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function money(value, symbol = "₹") {
  return `${symbol}${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("Dashboard");
  const [dark, setDark] = useState(
    localStorage.getItem("expense-theme") === "dark"
  );
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);

  const [expenses, setExpenses] = useState([]);
  const [income, setIncome] = useState([]);
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);

  const [totals, setTotals] = useState({
    income: 0,
    expense: 0,
    balance: 0,
    budget: 0
  });

  const [categoryTotals, setCategoryTotals] = useState({});
  const [monthCategoryTotals, setMonthCategoryTotals] = useState({});
  const [budgetStatus, setBudgetStatus] = useState([]);
  const [insights, setInsights] = useState({});
  const [trend, setTrend] = useState([]);
  const [recent, setRecent] = useState([]);
  const [transactions, setTransactions] = useState({
    expenses: [],
    income: []
  });

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(emptyFilters());
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters());

  const [report, setReport] = useState({
    monthly: {},
    monthly_income: {},
    categories: {}
  });

  const [profile, setProfile] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("expense-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    let mounted = true;

    api("/api/me")
      .then((d) => {
        if (mounted) setUser(d.user || null);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (user) loadDashboard();
  }, [user]);

  useEffect(() => {
    if (user && page === "Transactions") {
      loadTransactions(appliedFilters, query);
    }
  }, [user, page]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function loadDashboard() {
    try {
      setError("");
      const d = await api("/api/dashboard");

      setUser(d.user || user);
      setExpenses(Array.isArray(d.expenses) ? d.expenses : []);
      setIncome(Array.isArray(d.income) ? d.income : []);
      setCategories(Array.isArray(d.categories) ? d.categories : []);
      setBudgets(Array.isArray(d.budgets) ? d.budgets : []);
      setTotals(
        d.totals || {
          income: 0,
          expense: 0,
          balance: 0,
          budget: 0
        }
      );
      setCategoryTotals(d.category_totals || {});
      setMonthCategoryTotals(d.month_category_totals || {});
      setBudgetStatus(Array.isArray(d.budget_status) ? d.budget_status : []);
      setInsights(d.insights || {});
      setTrend(Array.isArray(d.trend) ? d.trend : []);
      setRecent(Array.isArray(d.recent) ? d.recent : []);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadTransactions(extra = appliedFilters, search = query) {
    try {
      setError("");

      const params = new URLSearchParams();

      Object.entries(extra || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.set(key, value);
        }
      });

      if (search) params.set("q", search);

      const queryString = params.toString();
      const d = await api(
        `/api/transactions${queryString ? `?${queryString}` : ""}`
      );

      setTransactions({
        expenses: Array.isArray(d.expenses) ? d.expenses : [],
        income: Array.isArray(d.income) ? d.income : []
      });
    } catch (e) {
      setError(e.message);
    }
  }

  async function login(username, password) {
    try {
      setError("");
      const d = await api("/api/login", {
        method: "POST",
        body: { username, password }
      });

      setUser(d.user);
      setPage("Dashboard");
    } catch (e) {
      setError(e.message);
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => {});

    setUser(null);
    setExpenses([]);
    setIncome([]);
    setCategories([]);
    setBudgets([]);
    setTransactions({ expenses: [], income: [] });
    setMonthCategoryTotals({});
    setBudgetStatus([]);
    setInsights({});
    setTrend([]);
    setRecent([]);
    setProfile(null);
    setSelected(null);
    setModal(null);
    setPage("Dashboard");
  }

  function closeModal() {
    setModal(null);
    setSelected(null);
  }

  async function saveExpense(form, id) {
    try {
      const fd = new FormData();

      Object.entries(form).forEach(([key, value]) => {
        if (key === "attachment") {
          if (value) fd.append("attachment", value);
        } else {
          fd.append(key, value ?? "");
        }
      });

      const d = id
        ? await api(`/api/expenses/${id}`, {
            method: "PATCH",
            body: fd
          })
        : await api("/api/expenses", {
            method: "POST",
            body: fd
          });

      const expense = d.expense;

      setExpenses((current) =>
        id
          ? current.map((item) => (item.id === id ? expense : item))
          : [expense, ...current]
      );

      closeModal();
      setToast(id ? "Expense updated successfully." : "Expense saved successfully.");

      await loadDashboard();

      if (page === "Transactions") {
        await loadTransactions(appliedFilters, query);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteExpense(id) {
    if (!window.confirm("Delete this expense? This action cannot be undone.")) {
      return;
    }

    try {
      await api(`/api/expenses/${id}`, { method: "DELETE" });

      setExpenses((current) => current.filter((item) => item.id !== id));
      setToast("Expense deleted successfully.");

      await loadDashboard();

      if (page === "Transactions") {
        await loadTransactions(appliedFilters, query);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveIncome(form, id) {
    try {
      const d = id
        ? await api(`/api/income/${id}`, {
            method: "PATCH",
            body: form
          })
        : await api("/api/income", {
            method: "POST",
            body: form
          });

      const item = d.income;

      setIncome((current) =>
        id
          ? current.map((v) => (v.id === id ? item : v))
          : [item, ...current]
      );

      closeModal();
      setToast(id ? "Income updated successfully." : "Income added successfully.");

      await loadDashboard();

      if (page === "Transactions") {
        await loadTransactions(appliedFilters, query);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteIncome(id) {
    if (!window.confirm("Delete this income? This action cannot be undone.")) {
      return;
    }

    try {
      await api(`/api/income/${id}`, { method: "DELETE" });

      setIncome((current) => current.filter((item) => item.id !== id));
      setToast("Income deleted successfully.");

      await loadDashboard();

      if (page === "Transactions") {
        await loadTransactions(appliedFilters, query);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function openProfile() {
    try {
      setError("");
      const d = await api("/api/profile");
      setProfile(d);
      setPage("Profile");
    } catch (e) {
      setError(e.message);
    }
  }

  const nav = [
    ["Dashboard", LayoutDashboard],
    ["Transactions", Receipt],
    ["Income", TrendingUp],
    ["Budgets", Wallet],
    ["Reports", BarChart3],
    ["Categories", Tags],
    ["Profile", User],
    ["Settings", Settings]
  ];

  if (loading) {
    return <div className="loading">Loading Expense Intelligence…</div>;
  }

  if (!user) {
    return <Login onLogin={login} error={error} />;
  }

  const symbol = user.currency_symbol || "₹";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SJ</div>
          <div>
            <strong>Saurabh Jadhav</strong>
            <span>Expense Intelligence</span>
          </div>
        </div>

        <div className="nav-label">MAIN MENU</div>

        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? "nav active" : "nav"}
              onClick={() => {
                setPage(name);
                setError("");
              }}
            >
              <Icon size={18} />
              <span>{name}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-card">
            <ShieldCheck size={18} />
            <div>
              <strong>Secure finance</strong>
              <span>PostgreSQL protected</span>
            </div>
          </div>

          <div className="account">
            <div className="avatar">
              {(user.full_name || "SJ").slice(0, 2).toUpperCase()}
            </div>

            <div>
              <strong>{user.full_name || user.username}</strong>
              <span>{user.currency}</span>
            </div>

            <button
              className="logout-mini"
              onClick={logout}
              title="Logout"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">PERSONAL FINANCE</div>
            <h1>{page}</h1>
            <p>
              {page === "Dashboard"
                ? `${greeting()}, ${(user.full_name || user.username).split(" ")[0]}. Here's your financial overview.`
                : `Manage your ${page.toLowerCase()} with confidence.`}
            </p>
          </div>

          <div className="top-actions">
            <button
              className="icon-btn"
              onClick={() => setDark((value) => !value)}
              title={dark ? "Light mode" : "Dark mode"}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>

            <button className="profile-chip" onClick={openProfile}>
              <span className="avatar small">
                {(user.full_name || "SJ").slice(0, 2).toUpperCase()}
              </span>
              {user.full_name || user.username}
            </button>

            <button className="logout-btn" onClick={logout}>
              <LogOut size={17} />
              Logout
            </button>

            <button
              className="primary-btn"
              onClick={() => setModal("add-expense")}
            >
              <Plus size={18} />
              Add Expense
            </button>
          </div>
        </header>

        {(error || toast) && (
          <div className={error ? "alert error" : "alert success"}>
            {error || toast}
            <button
              onClick={() => {
                setError("");
                setToast("");
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {page === "Dashboard" && (
          <Dashboard
            totals={totals}
            symbol={symbol}
            expenses={expenses}
            budgets={budgets}
            categoryTotals={categoryTotals}
            monthCategoryTotals={monthCategoryTotals}
            budgetStatus={budgetStatus}
            insights={insights}
            trend={trend}
            recent={recent}
            onTransactions={() => setPage("Transactions")}
            onBudget={() => setPage("Budgets")}
            onIncome={() => setModal("add-income")}
            onAddExpense={() => setModal("add-expense")}
            onRefresh={loadDashboard}
          />
        )}

        {page === "Transactions" && (
          <TransactionsPage
            symbol={symbol}
            categories={categories}
            data={transactions}
            query={query}
            setQuery={setQuery}
            filters={filters}
            setFilters={setFilters}
            apply={() => {
              setAppliedFilters({ ...filters });
              loadTransactions(filters, query);
            }}
            reset={() => {
              const fresh = emptyFilters();
              setFilters(fresh);
              setAppliedFilters(fresh);
              setQuery("");
              loadTransactions(fresh, "");
            }}
            onAdd={() => setModal("add-expense")}
            onView={(item) => {
              setSelected(item);
              setModal(
                item.type === "Income" ? "view-income" : "view-expense"
              );
            }}
            onEdit={(item) => {
              setSelected(item);
              setModal("edit-expense");
            }}
            onDelete={deleteExpense}
          />
        )}

        {page === "Income" && (
          <IncomePage
            symbol={symbol}
            income={income}
            onAdd={() => setModal("add-income")}
            onView={(item) => {
              setSelected(item);
              setModal("view-income");
            }}
            onEdit={(item) => {
              setSelected(item);
              setModal("edit-income");
            }}
            onDelete={deleteIncome}
          />
        )}

        {page === "Budgets" && (
          <BudgetsPage
            symbol={symbol}
            budgets={budgets}
            categories={categories}
            categoryTotals={categoryTotals}
            onRefresh={loadDashboard}
            setToast={setToast}
          />
        )}

        {page === "Reports" && (
          <ReportsPage
            symbol={symbol}
            report={report}
            load={async () => {
              try {
                setError("");
                setReport(await api("/api/reports"));
              } catch (e) {
                setError(e.message);
              }
            }}
          />
        )}

        {page === "Categories" && (
          <CategoriesPage
            categories={categories}
            onRefresh={loadDashboard}
            setToast={setToast}
          />
        )}

        {page === "Profile" && (
          <ProfilePage
            profile={profile}
            setProfile={setProfile}
            onLoad={openProfile}
            onSaved={(d) => {
              setUser(d.user);
              setToast("Profile updated successfully.");
            }}
          />
        )}

        {page === "Settings" && (
          <SettingsPage
            dark={dark}
            setDark={setDark}
            onLogout={logout}
            setToast={setToast}
          />
        )}

        <footer>
          © 2026 Saurabh Jadhav • Expense Intelligence
          <span>
            {user.currency_symbol} {user.currency}
          </span>
        </footer>
      </main>

      {modal === "add-expense" && (
        <ExpenseModal
          symbol={symbol}
          categories={
            categories.length
              ? categories.map((c) => c.name)
              : fallbackCategories
          }
          onClose={closeModal}
          onSave={(form) => saveExpense(form)}
        />
      )}

      {modal === "edit-expense" && selected && (
        <ExpenseModal
          symbol={symbol}
          categories={
            categories.length
              ? categories.map((c) => c.name)
              : fallbackCategories
          }
          initial={selected}
          onClose={closeModal}
          onSave={(form) => saveExpense(form, selected.id)}
        />
      )}

      {modal === "view-expense" && selected && (
        <ExpenseView
          item={selected}
          symbol={symbol}
          onClose={closeModal}
          onEdit={() => setModal("edit-expense")}
        />
      )}

      {modal === "add-income" && (
        <IncomeModal
          symbol={symbol}
          onClose={closeModal}
          onSave={(form) => saveIncome(form)}
        />
      )}

      {modal === "edit-income" && selected && (
        <IncomeModal
          symbol={symbol}
          initial={selected}
          onClose={closeModal}
          onSave={(form) => saveIncome(form, selected.id)}
        />
      )}

      {modal === "view-income" && selected && (
        <IncomeView
          item={selected}
          symbol={symbol}
          onClose={closeModal}
          onEdit={() => setModal("edit-income")}
        />
      )}
    </div>
  );
}

function Login({ onLogin, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();

    if (!username.trim() || !password) return;

    setSubmitting(true);

    try {
      await onLogin(username.trim(), password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand centered">
          <div className="brand-mark">SJ</div>
          <div>
            <strong>Saurabh Jadhav</strong>
            <span>Expense Intelligence</span>
          </div>
        </div>

        <div className="login-title">
          <span>SECURE FINANCE</span>
          <h1>Welcome Back</h1>
          <p>
            Sign in to manage your expenses, income and reports.
          </p>
        </div>

        {error && <div className="alert error">{error}</div>}

        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
            />
          </label>

          <label>
            Password
            <div className="password">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <button
            className="primary-btn full"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Login"}
            <ChevronRight size={18} />
          </button>
        </form>

        <small className="login-note">
          Your records are stored in PostgreSQL.
        </small>
      </div>
    </div>
  );
}

const chartPalette = [
  "var(--primary)", "var(--green)", "var(--orange)", "var(--violet)",
  "var(--red)", "#38bdf8", "#f472b6", "#14b8a6"
];

function Delta({ value, invert = false, caption = "vs last month" }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return <small className="delta neutral">No data for last month</small>;
  }

  const amount = Number(value);
  const up = amount > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <small className={`delta ${amount === 0 ? "neutral" : good ? "good" : "bad"}`}>
      {amount !== 0 && <Icon size={13} />}
      {Math.abs(amount).toFixed(1)}% {caption}
    </small>
  );
}

function TrendChart({ data, symbol }) {
  const rows = Array.isArray(data) ? data : [];

  if (!rows.length) {
    return <div className="empty">Not enough history to plot a trend yet.</div>;
  }

  const max = Math.max(
    1,
    ...rows.map((r) => Math.max(Number(r.income) || 0, Number(r.expense) || 0))
  );

  const W = 580;
  const H = 230;
  const padL = 12;
  const padR = 12;
  const padT = 16;
  const padB = 34;
  const plotH = H - padT - padB;
  const slot = (W - padL - padR) / rows.length;
  const bw = Math.max(8, Math.min(20, slot / 3.4));
  const gap = 6;

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="trend-chart"
        role="img"
        aria-label="Income compared with expenses over the last six months"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            className="grid-line"
            x1={padL}
            x2={W - padR}
            y1={padT + plotH * f}
            y2={padT + plotH * f}
          />
        ))}

        {rows.map((r, i) => {
          const cx = padL + slot * i + slot / 2;
          const income = Number(r.income) || 0;
          const expense = Number(r.expense) || 0;
          const incH = income > 0 ? Math.max(3, (income / max) * plotH) : 0;
          const expH = expense > 0 ? Math.max(3, (expense / max) * plotH) : 0;

          return (
            <g key={r.key || r.label}>
              {incH > 0 && (
                <rect
                  className="bar income"
                  x={cx - bw - gap / 2}
                  y={padT + plotH - incH}
                  width={bw}
                  height={incH}
                  rx={5}
                >
                  <title>{`${r.label} income: ${money(income, symbol)}`}</title>
                </rect>
              )}

              {expH > 0 && (
                <rect
                  className="bar expense"
                  x={cx + gap / 2}
                  y={padT + plotH - expH}
                  width={bw}
                  height={expH}
                  rx={5}
                >
                  <title>{`${r.label} expense: ${money(expense, symbol)}`}</title>
                </rect>
              )}

              <text x={cx} y={H - 12} textAnchor="middle" className="axis-label">
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="legend">
        <span>
          <i className="dot income" /> Income
        </span>
        <span>
          <i className="dot expense" /> Expense
        </span>
      </div>
    </div>
  );
}

function CategoryDonut({ data, total, symbol }) {
  if (!data.length || total <= 0) {
    return <div className="empty">No spending recorded for this period.</div>;
  }

  const R = 56;
  const SW = 20;
  const C = 2 * Math.PI * R;

  let acc = 0;
  const segments = data.map(([name, value], i) => {
    const fraction = value / total;
    const segment = {
      name,
      value,
      fraction,
      dash: fraction * C,
      offset: acc * C,
      color: chartPalette[i % chartPalette.length]
    };
    acc += fraction;
    return segment;
  });

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" className="donut" role="img" aria-label="Spending by category">
        <circle cx="80" cy="80" r={R} className="donut-track" strokeWidth={SW} fill="none" />

        {segments.map((s) => (
          <circle
            key={s.name}
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={SW}
            strokeDasharray={`${s.dash} ${C - s.dash}`}
            strokeDashoffset={-s.offset}
            transform="rotate(-90 80 80)"
          >
            <title>{`${s.name}: ${money(s.value, symbol)} (${(s.fraction * 100).toFixed(1)}%)`}</title>
          </circle>
        ))}

        <text x="80" y="76" textAnchor="middle" className="donut-value">
          {money(total, symbol)}
        </text>
        <text x="80" y="95" textAnchor="middle" className="donut-caption">
          Total spent
        </text>
      </svg>

      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.name}>
            <i style={{ background: s.color }} />
            <span>{s.name}</span>
            <b>{money(s.value, symbol)}</b>
            <small>{(s.fraction * 100).toFixed(0)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dashboard({
  totals,
  symbol,
  expenses,
  budgets,
  categoryTotals,
  monthCategoryTotals,
  budgetStatus,
  insights,
  trend,
  recent,
  onTransactions,
  onBudget,
  onIncome,
  onAddExpense,
  onRefresh
}) {
  const [scope, setScope] = useState("month");

  const ins = insights || {};
  const status = Array.isArray(budgetStatus) ? budgetStatus : [];

  const source =
    scope === "month"
      ? monthCategoryTotals || {}
      : categoryTotals || {};

  const cats = Object.entries(source)
    .map(([name, value]) => [name, Number(value) || 0])
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);

  const catTotal = cats.reduce((sum, [, value]) => sum + value, 0);
  const topCats = cats.slice(0, 6);

  // Fall back to the plain expense list if the API did not send merged activity.
  const activity =
    Array.isArray(recent) && recent.length
      ? recent
      : (expenses || []).slice(0, 8).map((e) => ({
          id: e.id,
          type: "Expense",
          date: e.date,
          title: e.description,
          category: e.category,
          payment: e.payment,
          amount: e.amount,
          attachment_url: e.attachment_url
        }));

  const budgetTotal = Number(ins.budget_total ?? totals.budget ?? 0);
  const budgetSpent = Number(ins.budget_spent ?? 0);
  const budgetUsed = Number(ins.budget_used_pct ?? 0);
  const overBudget = Number(ins.over_budget_count || 0);

  const pace =
    ins.projected_expense != null && budgetTotal > 0
      ? Number(ins.projected_expense) - budgetTotal
      : null;

  return (
    <>
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-icon blue">
            <Wallet size={20} />
          </div>
          <span>Total Balance</span>
          <h2>{money(totals.balance, symbol)}</h2>
          <small>All income minus all expenses</small>
        </div>

        <div className="metric-card">
          <div className="metric-icon red">
            <ArrowDownRight size={20} />
          </div>
          <span>Spent This Month</span>
          <h2>{money(ins.month_expense ?? 0, symbol)}</h2>
          <Delta value={ins.expense_change_pct} invert />
        </div>

        <div className="metric-card">
          <div className="metric-icon green">
            <ArrowUpRight size={20} />
          </div>
          <span>Earned This Month</span>
          <h2>{money(ins.month_income ?? 0, symbol)}</h2>
          <Delta value={ins.income_change_pct} />
        </div>

        <div className="metric-card">
          <div className="metric-icon violet">
            <Target size={20} />
          </div>
          <span>Budget Remaining</span>
          <h2>{money(Math.max(budgetTotal - budgetSpent, 0), symbol)}</h2>

          {budgetTotal > 0 ? (
            <>
              <div className="progress slim">
                <i
                  className={budgetUsed > 100 ? "over" : budgetUsed >= 80 ? "warn" : ""}
                  style={{ width: `${Math.min(budgetUsed, 100)}%` }}
                />
              </div>
              <small>{budgetUsed.toFixed(0)}% of this month's budget used</small>
            </>
          ) : (
            <small>No budget set for {ins.period_label || "this month"}</small>
          )}
        </div>
      </div>

      {overBudget > 0 && (
        <div className="alert warn dashboard-alert">
          <AlertTriangle size={17} />
          <span>
            {overBudget === 1
              ? "1 category has gone over its budget this month."
              : `${overBudget} categories have gone over their budgets this month.`}
          </span>
          <button className="text-btn" onClick={onBudget}>
            Review budgets
          </button>
        </div>
      )}

      <div className="insight-strip">
        <div className="insight">
          <span>
            <Activity size={15} /> Average daily spend
          </span>
          <strong>{money(ins.avg_daily_spend ?? 0, symbol)}</strong>
          <small>
            Over {ins.days_elapsed ?? 0} of {ins.days_in_month ?? 0} days
          </small>
        </div>

        <div className="insight">
          <span>
            <CalendarDays size={15} /> Projected month end
          </span>
          <strong>{money(ins.projected_expense ?? 0, symbol)}</strong>
          <small>
            {pace === null
              ? "Set a budget to track your pace"
              : pace > 0
              ? `${money(pace, symbol)} over budget at this pace`
              : `${money(Math.abs(pace), symbol)} under budget at this pace`}
          </small>
        </div>

        <div className="insight">
          <span>
            <PiggyBank size={15} /> Savings rate
          </span>
          <strong>
            {ins.savings_rate === null || ins.savings_rate === undefined
              ? "—"
              : `${Number(ins.savings_rate).toFixed(1)}%`}
          </strong>
          <small>
            {ins.savings_rate === null || ins.savings_rate === undefined
              ? "No income recorded this month"
              : "Of this month's income kept"}
          </small>
        </div>

        <div className="insight">
          <span>
            <Receipt size={15} /> Transactions
          </span>
          <strong>{ins.month_txn_count ?? 0}</strong>
          <small>Recorded in {ins.period_label || "this month"}</small>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel large">
          <div className="panel-head">
            <div>
              <h2>Income vs Expense</h2>
              <p>Last six months at a glance</p>
            </div>

            <button className="soft-btn" onClick={onRefresh} title="Reload dashboard data">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>

          <TrendChart data={trend} symbol={symbol} />
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Where It Goes</h2>
              <p>
                {scope === "month"
                  ? ins.period_label || "This month"
                  : "All time"}
              </p>
            </div>

            <div className="scope-switch">
              <button
                className={scope === "month" ? "selected" : ""}
                onClick={() => setScope("month")}
              >
                Month
              </button>
              <button
                className={scope === "all" ? "selected" : ""}
                onClick={() => setScope("all")}
              >
                All
              </button>
            </div>
          </div>

          <CategoryDonut data={topCats} total={catTotal} symbol={symbol} />
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel large">
          <div className="panel-head">
            <div>
              <h2>Budget Health</h2>
              <p>{ins.period_label || "Current month"} limits vs actual spending</p>
            </div>

            <button className="soft-btn" onClick={onBudget}>
              Manage <ChevronRight size={15} />
            </button>
          </div>

          {status.length ? (
            status.slice(0, 5).map((budget) => (
              <BudgetMini key={budget.id} budget={budget} symbol={symbol} />
            ))
          ) : budgets && budgets.length ? (
            <div className="empty">
              No budget set for {ins.period_label || "this month"}. Create one to track your spending.
            </div>
          ) : (
            <div className="empty">No budgets created yet.</div>
          )}

          {Array.isArray(ins.unbudgeted_categories) && ins.unbudgeted_categories.length > 0 && (
            <p className="panel-note">
              Unbudgeted this month: {ins.unbudgeted_categories.join(", ")}
            </p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Highlights</h2>
              <p>{ins.period_label || "This month"}</p>
            </div>
          </div>

          <div className="highlight">
            <span>Top category</span>
            {ins.top_category ? (
              <>
                <strong>{ins.top_category.name}</strong>
                <small>{money(ins.top_category.amount, symbol)} spent</small>
              </>
            ) : (
              <small>No spending recorded yet.</small>
            )}
          </div>

          <div className="highlight">
            <span>Largest single expense</span>
            {ins.biggest_expense ? (
              <>
                <strong>{ins.biggest_expense.description}</strong>
                <small>
                  {money(ins.biggest_expense.amount, symbol)} • {ins.biggest_expense.category} •{" "}
                  {dateLabel(ins.biggest_expense.date)}
                </small>
              </>
            ) : (
              <small>No expenses recorded yet.</small>
            )}
          </div>

          <div className="highlight">
            <span>Net this month</span>
            <strong className={Number(ins.month_balance || 0) < 0 ? "negative" : "positive"}>
              {money(ins.month_balance ?? 0, symbol)}
            </strong>
            <small>
              {money(ins.month_income ?? 0, symbol)} in, {money(ins.month_expense ?? 0, symbol)} out
            </small>
          </div>

          <div className="highlight-actions">
            <button className="soft-btn" onClick={onAddExpense}>
              <Plus size={15} /> Expense
            </button>
            <button className="soft-btn" onClick={onIncome}>
              <TrendingUp size={15} /> Income
            </button>
          </div>
        </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <h2>Recent Activity</h2>
            <p>Your latest income and expenses</p>
          </div>

          <button className="primary-btn" onClick={onTransactions}>
            View all
          </button>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Type</th>
                <th>Category</th>
                <th>Payment</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              {activity.map((row) => (
                <tr key={`${row.type}-${row.id}`}>
                  <td>{dateLabel(row.date)}</td>

                  <td>
                    <b>{row.title}</b>

                    {row.attachment_url && (
                      <a
                        className="attachment"
                        href={row.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Paperclip size={13} />
                        Receipt
                      </a>
                    )}
                  </td>

                  <td>
                    <span className={row.type === "Income" ? "chip credit" : "chip debit"}>
                      {row.type}
                    </span>
                  </td>

                  <td>
                    <span className="badge">{row.category}</span>
                  </td>

                  <td>{row.payment}</td>

                  <td className={row.type === "Income" ? "amount credit" : "amount debit"}>
                    {row.type === "Income" ? "+" : "−"} {money(row.amount, symbol)}
                  </td>
                </tr>
              ))}

              {!activity.length && (
                <tr>
                  <td colSpan="6" className="empty">
                    Nothing recorded yet. Add your first expense to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function BudgetMini({ budget, symbol, spent }) {
  const amount = Number(budget.amount || 0);
  const used = Number(budget.spent ?? spent ?? 0);
  const pct =
    budget.used_pct != null
      ? Number(budget.used_pct)
      : amount > 0
      ? (used / amount) * 100
      : 0;

  const state = budget.state || (pct > 100 ? "over" : pct >= 80 ? "warning" : "safe");
  const remaining = amount - used;

  return (
    <div className={`budget-item ${state}`}>
      <div className="budget-title">
        <span>
          {budget.category}
          {state === "over" && <em className="tag over">Over</em>}
          {state === "warning" && <em className="tag warn">Close</em>}
        </span>
        <strong>{money(amount, symbol)}</strong>
      </div>

      <div className="progress">
        <i
          className={state === "over" ? "over" : state === "warning" ? "warn" : ""}
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>

      <small>
        {money(used, symbol)} used • {pct.toFixed(0)}% •{" "}
        {remaining >= 0
          ? `${money(remaining, symbol)} left`
          : `${money(Math.abs(remaining), symbol)} over`}
      </small>
    </div>
  );
}

function TransactionsPage({
  symbol,
  categories,
  data,
  query,
  setQuery,
  filters,
  setFilters,
  apply,
  reset,
  onAdd,
  onView,
  onEdit,
  onDelete
}) {
  const all = useMemo(() => {
    return [
      ...(data.expenses || []).map((x) => ({
        ...x,
        type: "Expense"
      })),
      ...(data.income || []).map((x) => ({
        ...x,
        type: "Income"
      }))
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [data]);

  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <div>
          <h2>Transactions</h2>
          <p>
            Date range and filters are applied to PostgreSQL records.
          </p>
        </div>

        <button className="primary-btn" onClick={onAdd}>
          <Plus size={17} />
          Add Expense
        </button>
      </div>

      <div className="filter-panel">
        <div className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search description or category..."
          />
        </div>

        <label>
          From
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) =>
              setFilters({
                ...filters,
                start_date: e.target.value
              })
            }
          />
        </label>

        <label>
          To
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) =>
              setFilters({
                ...filters,
                end_date: e.target.value
              })
            }
          />
        </label>

        <select
          value={filters.category}
          onChange={(e) =>
            setFilters({
              ...filters,
              category: e.target.value
            })
          }
        >
          <option value="">All Categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.name}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          value={filters.payment_method}
          onChange={(e) =>
            setFilters({
              ...filters,
              payment_method: e.target.value
            })
          }
        >
          <option value="">All Payments</option>
          {payments.map((payment) => (
            <option key={payment}>{payment}</option>
          ))}
        </select>

        <select
          value={filters.kind}
          onChange={(e) =>
            setFilters({
              ...filters,
              kind: e.target.value
            })
          }
        >
          <option value="all">All Types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
        </select>

        <input
          type="number"
          min="0"
          placeholder="Min amount"
          value={filters.min_amount}
          onChange={(e) =>
            setFilters({
              ...filters,
              min_amount: e.target.value
            })
          }
        />

        <input
          type="number"
          min="0"
          placeholder="Max amount"
          value={filters.max_amount}
          onChange={(e) =>
            setFilters({
              ...filters,
              max_amount: e.target.value
            })
          }
        />

        <div className="filter-actions">
          <button className="primary-btn" onClick={apply}>
            <Filter size={16} />
            Apply Filter
          </button>

          <button className="soft-btn" onClick={reset}>
            Reset
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th>Category / Source</th>
              <th>Payment</th>
              <th>Amount</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {all.map((item) => (
              <tr key={`${item.type}-${item.id}`}>
                <td>{dateLabel(item.date)}</td>

                <td>
                  <span
                    className={
                      item.type === "Income"
                        ? "type income-type"
                        : "type expense-type"
                    }
                  >
                    {item.type}
                  </span>
                </td>

                <td>
                  <b>{item.description}</b>

                  {item.type === "Expense" &&
                    item.attachment &&
                    item.attachment_url && (
                      <a
                        className="attachment"
                        href={item.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Paperclip size={13} />
                        Receipt
                      </a>
                    )}
                </td>

                <td>
                  <span className="badge">
                    {item.category || item.source}
                  </span>
                </td>

                <td>{item.payment || "—"}</td>

                <td
                  className={
                    item.type === "Income"
                      ? "positive amount"
                      : "negative amount"
                  }
                >
                  {item.type === "Income" ? "+ " : "− "}
                  {money(item.amount, symbol)}
                </td>

                <td>
                  <div className="row-actions">
                    <button
                      title="View"
                      onClick={() => onView(item)}
                    >
                      <Eye size={16} />
                    </button>

                    {item.type === "Expense" && (
                      <>
                        <button
                          title="Edit"
                          onClick={() => onEdit(item)}
                        >
                          <Edit3 size={16} />
                        </button>

                        <button
                          className="danger-action"
                          title="Delete"
                          onClick={() => onDelete(item.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {!all.length && (
              <tr>
                <td colSpan="7" className="empty">
                  No matching transactions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExpenseModal({
  initial,
  symbol,
  categories,
  onClose,
  onSave
}) {
  const [form, setForm] = useState(
    initial
      ? {
          date: initial.date,
          amount: initial.amount,
          category: initial.category,
          payment: initial.payment,
          description: initial.description,
          attachment: null
        }
      : {
          date: today(),
          amount: "",
          category: categories[0] || "Food",
          payment: "UPI",
          description: "",
          attachment: null
        }
  );

  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState("");

  async function submit(e) {
    e.preventDefault();

    if (!form.date) {
      setValidation("Date is required.");
      return;
    }

    if (Number(form.amount) <= 0) {
      setValidation("Amount must be greater than zero.");
      return;
    }

    if (!form.description.trim()) {
      setValidation("Description is required.");
      return;
    }

    setValidation("");
    setSaving(true);

    try {
      await onSave({
        ...form,
        description: form.description.trim()
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Edit Expense" : "Add Expense"} onClose={onClose}>
      {validation && <div className="alert error">{validation}</div>}

      <form className="form-grid" onSubmit={submit}>
        <Field label="Date">
          <input
            type="date"
            value={form.date}
            onChange={(e) =>
              setForm({
                ...form,
                date: e.target.value
              })
            }
            required
          />
        </Field>

        <Field label="Amount">
          <div className="money-input">
            <span>{symbol}</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm({
                  ...form,
                  amount: e.target.value
                })
              }
              required
            />
          </div>
        </Field>

        <Field label="Category">
          <select
            value={form.category}
            onChange={(e) =>
              setForm({
                ...form,
                category: e.target.value
              })
            }
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>

        <Field label="Payment Method">
          <select
            value={form.payment}
            onChange={(e) =>
              setForm({
                ...form,
                payment: e.target.value
              })
            }
          >
            {payments.map((payment) => (
              <option key={payment}>{payment}</option>
            ))}
          </select>
        </Field>

        <Field label="Description" full>
          <input
            value={form.description}
            onChange={(e) =>
              setForm({
                ...form,
                description: e.target.value
              })
            }
            maxLength="250"
            required
          />
        </Field>

        <Field
          label={initial ? "Replace Attachment" : "Attachment"}
          full
        >
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={(e) =>
              setForm({
                ...form,
                attachment: e.target.files?.[0] || null
              })
            }
          />

          {initial?.attachment_url && (
            <a
              className="attachment current"
              href={initial.attachment_url}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={14} />
              Current receipt
            </a>
          )}
        </Field>

        <div className="modal-actions">
          <button
            type="button"
            className="soft-btn"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button className="primary-btn" disabled={saving}>
            <Check size={17} />
            {saving ? "Saving…" : "Save Expense"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ExpenseView({ item, symbol, onClose, onEdit }) {
  return (
    <Modal title="Expense Details" onClose={onClose}>
      <div className="detail-card">
        <div>
          <span>Date</span>
          <strong>{dateLabel(item.date)}</strong>
        </div>

        <div>
          <span>Description</span>
          <strong>{item.description}</strong>
        </div>

        <div>
          <span>Category</span>
          <strong>{item.category}</strong>
        </div>

        <div>
          <span>Payment Method</span>
          <strong>{item.payment}</strong>
        </div>

        <div className="detail-total">
          <span>Amount</span>
          <strong>{money(item.amount, symbol)}</strong>
        </div>
      </div>

      {item.attachment_url ? (
        <a
          className="receipt-preview"
          href={item.attachment_url}
          target="_blank"
          rel="noreferrer"
        >
          <Paperclip size={17} />
          View / Open attached receipt
        </a>
      ) : (
        <div className="no-attachment">No receipt attached.</div>
      )}

      <div className="modal-actions">
        <button className="soft-btn" onClick={onClose}>
          Close
        </button>

        <button className="primary-btn" onClick={onEdit}>
          <Edit3 size={16} />
          Edit Expense
        </button>
      </div>
    </Modal>
  );
}

function IncomePage({
  symbol,
  income,
  onAdd,
  onView,
  onEdit,
  onDelete
}) {
  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <div>
          <h2>Income Management</h2>
          <p>Add, view, edit and delete income records.</p>
        </div>

        <button className="primary-btn" onClick={onAdd}>
          <Plus size={17} />
          Add Income
        </button>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Source</th>
              <th>Description</th>
              <th>Payment</th>
              <th>Amount</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {income.map((item) => (
              <tr key={item.id}>
                <td>{dateLabel(item.date)}</td>

                <td>
                  <span className="badge green">
                    {item.source}
                  </span>
                </td>

                <td>{item.description}</td>
                <td>{item.payment}</td>

                <td className="positive amount">
                  + {money(item.amount, symbol)}
                </td>

                <td>
                  <div className="row-actions">
                    <button
                      onClick={() => onView(item)}
                      title="View"
                    >
                      <Eye size={16} />
                    </button>

                    <button
                      onClick={() => onEdit(item)}
                      title="Edit"
                    >
                      <Edit3 size={16} />
                    </button>

                    <button
                      className="danger-action"
                      onClick={() => onDelete(item.id)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!income.length && (
              <tr>
                <td colSpan="6" className="empty">
                  No income records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IncomeModal({
  initial,
  symbol,
  onClose,
  onSave
}) {
  const [form, setForm] = useState(
    initial
      ? {
          date: initial.date,
          amount: initial.amount,
          source: initial.source,
          payment: initial.payment,
          description: initial.description
        }
      : {
          date: today(),
          amount: "",
          source: "Salary",
          payment: "Bank Transfer",
          description: ""
        }
  );

  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState("");

  async function submit(e) {
    e.preventDefault();

    if (!form.date) {
      setValidation("Date is required.");
      return;
    }

    if (Number(form.amount) <= 0) {
      setValidation("Amount must be greater than zero.");
      return;
    }

    if (!form.source.trim()) {
      setValidation("Income source is required.");
      return;
    }

    if (!form.description.trim()) {
      setValidation("Description is required.");
      return;
    }

    setValidation("");
    setSaving(true);

    try {
      await onSave({
        ...form,
        source: form.source.trim(),
        description: form.description.trim()
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Edit Income" : "Add Income"} onClose={onClose}>
      {validation && <div className="alert error">{validation}</div>}

      <form className="form-grid" onSubmit={submit}>
        <Field label="Date">
          <input
            type="date"
            value={form.date}
            onChange={(e) =>
              setForm({
                ...form,
                date: e.target.value
              })
            }
            required
          />
        </Field>

        <Field label="Amount">
          <div className="money-input">
            <span>{symbol}</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm({
                  ...form,
                  amount: e.target.value
                })
              }
              required
            />
          </div>
        </Field>

        <Field label="Source">
          <input
            value={form.source}
            onChange={(e) =>
              setForm({
                ...form,
                source: e.target.value
              })
            }
            required
          />
        </Field>

        <Field label="Payment Method">
          <select
            value={form.payment}
            onChange={(e) =>
              setForm({
                ...form,
                payment: e.target.value
              })
            }
          >
            {payments.map((payment) => (
              <option key={payment}>{payment}</option>
            ))}
          </select>
        </Field>

        <Field label="Description" full>
          <input
            value={form.description}
            onChange={(e) =>
              setForm({
                ...form,
                description: e.target.value
              })
            }
            required
          />
        </Field>

        <div className="modal-actions">
          <button
            type="button"
            className="soft-btn"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button className="primary-btn" disabled={saving}>
            <Check size={17} />
            {saving
              ? "Saving…"
              : initial
              ? "Update Income"
              : "Save Income"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function IncomeView({ item, symbol, onClose, onEdit }) {
  return (
    <Modal title="Income Details" onClose={onClose}>
      <div className="detail-card">
        <div>
          <span>Date</span>
          <strong>{dateLabel(item.date)}</strong>
        </div>

        <div>
          <span>Source</span>
          <strong>{item.source}</strong>
        </div>

        <div>
          <span>Description</span>
          <strong>{item.description}</strong>
        </div>

        <div>
          <span>Payment Method</span>
          <strong>{item.payment}</strong>
        </div>

        <div className="detail-total positive">
          <span>Amount</span>
          <strong>+ {money(item.amount, symbol)}</strong>
        </div>
      </div>

      <div className="modal-actions">
        <button className="soft-btn" onClick={onClose}>
          Close
        </button>

        <button className="primary-btn" onClick={onEdit}>
          <Edit3 size={16} />
          Edit Income
        </button>
      </div>
    </Modal>
  );
}

function BudgetsPage({
  symbol,
  budgets,
  categories,
  categoryTotals,
  onRefresh,
  setToast
}) {
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!category) {
      setToast("Please select a category.");
      return;
    }

    if (Number(amount) <= 0) {
      setToast("Budget amount must be greater than zero.");
      return;
    }

    setSaving(true);

    try {
      await api("/api/budgets", {
        method: "POST",
        body: {
          category,
          amount,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear()
        }
      });

      setCategory("");
      setAmount("");
      setToast("Budget created successfully.");
      await onRefresh();
    } catch (e) {
      setToast(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    if (!window.confirm("Delete budget?")) return;

    try {
      await api(`/api/budgets/${id}`, {
        method: "DELETE"
      });

      setToast("Budget deleted successfully.");
      await onRefresh();
    } catch (e) {
      setToast(e.message);
    }
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Budget Management</h2>
            <p>Create limits and monitor your monthly plan.</p>
          </div>
        </div>

        {budgets.map((budget) => {
          const total = Number(budget.amount || 0);
          const spent = Number(categoryTotals?.[budget.category] || 0);
          const percent =
            total > 0
              ? Math.min((spent / total) * 100, 100)
              : 0;

          return (
            <div className="budget-item" key={budget.id}>
              <div className="budget-title">
                <span>
                  {budget.category} · {monthName(budget.month)}{" "}
                  {budget.year}
                </span>

                <div>
                  <strong>{money(total, symbol)}</strong>

                  <button
                    className="icon-danger"
                    onClick={() => del(budget.id)}
                    title="Delete budget"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="progress">
                <i style={{ width: `${percent}%` }} />
              </div>

              <small>
                {money(spent, symbol)} used ·{" "}
                {Math.max(total - spent, 0).toLocaleString("en-IN")} remaining
              </small>
            </div>
          );
        })}

        {!budgets.length && (
          <div className="empty">No budgets created yet.</div>
        )}
      </section>

      <section className="panel">
        <h2>Create Budget</h2>
        <p>Set a monthly category limit.</p>

        <div className="simple-form">
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select category</option>
              {categories.map((item) => (
                <option key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <label>
            Amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000"
            />
          </label>

          <button
            className="primary-btn"
            onClick={add}
            disabled={saving}
          >
            <Plus size={17} />
            {saving ? "Creating…" : "Create Budget"}
          </button>
        </div>
      </section>
    </div>
  );
}

function CategoriesPage({
  categories,
  onRefresh,
  setToast
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    const cleanName = name.trim();

    if (!cleanName) {
      setToast("Category name is required.");
      return;
    }

    setSaving(true);

    try {
      await api("/api/categories", {
        method: "POST",
        body: { name: cleanName }
      });

      setName("");
      setToast("Category added successfully.");
      await onRefresh();
    } catch (e) {
      setToast(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    if (
      !window.confirm(
        "Delete category? Existing expenses remain unchanged."
      )
    ) {
      return;
    }

    try {
      await api(`/api/categories/${id}`, {
        method: "DELETE"
      });

      setToast("Category deleted successfully.");
      await onRefresh();
    } catch (e) {
      setToast(e.message);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Categories</h2>
          <p>Manage your spending categories.</p>
        </div>

        <div className="inline-add">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category"
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />

          <button
            className="primary-btn"
            onClick={add}
            disabled={saving}
          >
            <Plus size={16} />
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      <div className="category-cards">
        {categories.map((category) => (
          <div className="category-card" key={category.id}>
            <div className="category-symbol">
              {category.icon || "•"}
            </div>

            <div>
              <strong>{category.name}</strong>
              <span>Expense category</span>
            </div>

            <button
              onClick={() => del(category.id)}
              title="Delete category"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {!categories.length && (
        <div className="empty">No categories available.</div>
      )}
    </section>
  );
}

function ReportsPage({ symbol, report, load }) {
  const currentYear = new Date().getFullYear();

  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(currentYear);

  const [startMonth, setStartMonth] = useState(1);
  const [startYear, setStartYear] = useState(currentYear);
  const [endMonth, setEndMonth] = useState(new Date().getMonth() + 1);
  const [endYear, setEndYear] = useState(currentYear);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const months = Object.keys(report.monthly || {});
  const values = Object.values(report.monthly || {}).map(Number);
  const max = Math.max(...values, 1);

  const categoryValues = Object.values(report.categories || {}).map(Number);
  const categoryMax = Math.max(...categoryValues, 1);

  async function refresh() {
    setLoading(true);
    try {
      await load();
    } finally {
      setLoading(false);
    }
  }

  function downloadMonthly() {
    window.open(
      `/statements/monthly/pdf?month=${month}&year=${year}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function downloadRange() {
    if (
      startYear > endYear ||
      (startYear === endYear && startMonth > endMonth)
    ) {
      window.alert("From period must be before or equal to To period.");
      return;
    }

    window.open(
      `/statements/range/pdf?start_month=${startMonth}&start_year=${startYear}&end_month=${endMonth}&end_year=${endYear}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  return (
    <div className="reports">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Report Downloads</h2>
            <p>
              Select a month or custom month range and download a PDF.
            </p>
          </div>

          <button
            className="icon-btn"
            onClick={refresh}
            title="Refresh reports"
            disabled={loading}
          >
            <RefreshCw
              size={18}
              className={loading ? "spin" : ""}
            />
          </button>
        </div>

        <div className="report-controls">
          <label>
            Month
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {monthName(i + 1)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Year
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years().map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <button className="primary-btn" onClick={downloadMonthly}>
            <FileText size={16} />
            Download Monthly PDF
          </button>
        </div>

        <div className="range-controls">
          <label>
            From Month
            <select
              value={startMonth}
              onChange={(e) =>
                setStartMonth(Number(e.target.value))
              }
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {monthName(i + 1)}
                </option>
              ))}
            </select>
          </label>

          <label>
            From Year
            <select
              value={startYear}
              onChange={(e) =>
                setStartYear(Number(e.target.value))
              }
            >
              {years().map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            To Month
            <select
              value={endMonth}
              onChange={(e) =>
                setEndMonth(Number(e.target.value))
              }
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {monthName(i + 1)}
                </option>
              ))}
            </select>
          </label>

          <label>
            To Year
            <select
              value={endYear}
              onChange={(e) =>
                setEndYear(Number(e.target.value))
              }
            >
              {years().map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <button className="primary-btn" onClick={downloadRange}>
            <Download size={16} />
            Download Range PDF
          </button>
        </div>

        <div className="export-row">
          <a className="soft-btn" href="/reports/export.xlsx">
            <Download size={16} />
            Download Excel Workbook
          </a>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Monthly Expenses</h2>
            <p>Stored PostgreSQL transaction data</p>
          </div>
        </div>

        <div className="analytics-bars">
          {months.length ? (
            months.map((item) => (
              <div className="analytics-row" key={item}>
                <div>
                  <span>{item}</span>
                  <b>{money(report.monthly[item], symbol)}</b>
                </div>

                <div className="bar-track">
                  <i
                    style={{
                      width: `${(Number(report.monthly[item]) / max) * 100}%`
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No monthly expense data.</div>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Category Analysis</h2>

        {Object.entries(report.categories || {})
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .map(([name, value]) => (
            <div className="analytics-row" key={name}>
              <div>
                <span>{name}</span>
                <b>{money(value, symbol)}</b>
              </div>

              <div className="bar-track">
                <i
                  style={{
                    width: `${(Number(value) / categoryMax) * 100}%`
                  }}
                />
              </div>
            </div>
          ))}

        {!Object.keys(report.categories || {}).length && (
          <div className="empty">No category data.</div>
        )}
      </section>
    </div>
  );
}

function years() {
  const current = new Date().getFullYear();
  return Array.from({ length: 11 }, (_, index) => current - index);
}

function ProfilePage({
  profile,
  setProfile,
  onLoad,
  onSaved
}) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) {
      onLoad();
      return;
    }

    setName(profile.user?.full_name || "");
    setCurrency(profile.user?.currency || "INR");
  }, [profile]);

  if (!profile) {
    return <div className="loading">Loading profile…</div>;
  }

  async function save() {
    if (!name.trim()) {
      window.alert("Full name is required.");
      return;
    }

    setSaving(true);

    try {
      const d = await api("/api/profile", {
        method: "PATCH",
        body: {
          full_name: name.trim(),
          currency
        }
      });

      setProfile({
        ...profile,
        user: d.user
      });

      onSaved(d);
    } catch (e) {
      window.alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel profile-panel">
      <div className="profile-header">
        <div className="profile-avatar">
          {name.slice(0, 2).toUpperCase() || "SJ"}
        </div>

        <div>
          <h2>{name}</h2>
          <p>Profile information</p>
        </div>
      </div>

      <div className="form-grid profile-form">
        <Field label="Full Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>

        <Field label="Currency">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {(profile.currencies || []).map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button
        className="primary-btn"
        onClick={save}
        disabled={saving}
      >
        <Check size={17} />
        {saving ? "Saving…" : "Save Profile"}
      </button>
    </section>
  );
}

const strengthLabels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Excellent"];

function passwordScore(password) {
  if (!password) return 0;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  return Math.min(score, 5);
}

/** Mirrors the server-side rules in password_problem() so users get instant feedback. */
function passwordProblem(password) {
  const value = password || "";
  if (value.length < 8) return "Password must contain at least 8 characters.";
  if (value.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[A-Za-z]/.test(value)) return "Password must contain at least one letter.";
  if (!/\d/.test(value)) return "Password must contain at least one number.";
  if (value.trim() !== value) return "Password cannot start or end with a space.";
  return null;
}

function PasswordInput({ label, value, onChange, visible, onToggle, autoComplete }) {
  return (
    <Field label={label} full>
      <div className="password-input">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          spellCheck="false"
        />

        <button
          type="button"
          className="peek"
          onClick={onToggle}
          title={visible ? "Hide password" : "Show password"}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </Field>
  );
}

function ChangePasswordCard({ onToast }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const score = passwordScore(next);
  const mismatch = confirm.length > 0 && next !== confirm;
  const localProblem = next.length > 0 ? passwordProblem(next) : null;

  function toggle(key) {
    setShow((s) => ({ ...s, [key]: !s[key] }));
  }

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShow({ current: false, next: false, confirm: false });
  }

  async function submit(e) {
    e.preventDefault();
    setMessage(null);

    if (!current) {
      setMessage({ type: "error", text: "Enter your current password." });
      return;
    }

    const problem = passwordProblem(next);
    if (problem) {
      setMessage({ type: "error", text: problem });
      return;
    }

    if (next !== confirm) {
      setMessage({ type: "error", text: "The new passwords do not match." });
      return;
    }

    if (next === current) {
      setMessage({
        type: "error",
        text: "The new password must be different from the current one."
      });
      return;
    }

    setSaving(true);

    try {
      const d = await api("/api/change-password", {
        method: "POST",
        body: {
          current_password: current,
          new_password: next,
          confirm_password: confirm
        }
      });

      reset();
      setMessage({
        type: "success",
        text: d.message || "Password changed successfully."
      });

      if (onToast) onToast("Password changed successfully.");
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel security-panel">
      <div className="panel-head">
        <div>
          <h2>
            <KeyRound size={18} /> Change Password
          </h2>
          <p>Update the password you use to sign in.</p>
        </div>
      </div>

      <form onSubmit={submit} className="form-grid password-form">
        <PasswordInput
          label="Current Password"
          value={current}
          onChange={setCurrent}
          visible={show.current}
          onToggle={() => toggle("current")}
          autoComplete="current-password"
        />

        <PasswordInput
          label="New Password"
          value={next}
          onChange={setNext}
          visible={show.next}
          onToggle={() => toggle("next")}
          autoComplete="new-password"
        />

        {next.length > 0 && (
          <div className="strength full">
            <div className="strength-track">
              {[0, 1, 2, 3, 4].map((i) => (
                <i
                  key={i}
                  className={
                    i < score
                      ? score <= 2
                        ? "on weak"
                        : score <= 3
                        ? "on fair"
                        : "on strong"
                      : ""
                  }
                />
              ))}
            </div>

            <small className={localProblem ? "bad" : ""}>
              {localProblem || `Strength: ${strengthLabels[score]}`}
            </small>
          </div>
        )}

        <PasswordInput
          label="Confirm New Password"
          value={confirm}
          onChange={setConfirm}
          visible={show.confirm}
          onToggle={() => toggle("confirm")}
          autoComplete="new-password"
        />

        {mismatch && (
          <small className="field-error full">The passwords do not match.</small>
        )}

        <ul className="password-rules full">
          <li className={next.length >= 8 ? "ok" : ""}>At least 8 characters</li>
          <li className={/[A-Za-z]/.test(next) ? "ok" : ""}>Contains a letter</li>
          <li className={/\d/.test(next) ? "ok" : ""}>Contains a number</li>
          <li className={next.length > 0 && next !== current ? "ok" : ""}>
            Different from the current password
          </li>
        </ul>

        {message && (
          <div className={`inline-alert full ${message.type}`}>
            {message.type === "success" ? <Check size={16} /> : <AlertTriangle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="form-actions full">
          <button
            type="submit"
            className="primary-btn"
            disabled={saving || !current || !next || !confirm || mismatch || !!localProblem}
          >
            <ShieldCheck size={17} />
            {saving ? "Updating…" : "Update Password"}
          </button>

          <button type="button" className="soft-btn" onClick={reset} disabled={saving}>
            Clear
          </button>
        </div>
      </form>
    </section>
  );
}

function SettingsPage({ dark, setDark, onLogout, setToast }) {
  return (
    <div className="page-grid">
      <section className="panel">
        <h2>Appearance</h2>
        <p>Choose your preferred theme.</p>

        <div className="theme-switch">
          <button
            className={!dark ? "selected" : ""}
            onClick={() => setDark(false)}
          >
            <Sun size={18} />
            Light
          </button>

          <button
            className={dark ? "selected" : ""}
            onClick={() => setDark(true)}
          >
            <Moon size={18} />
            Dark
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Account</h2>
        <p>End your current secure session on this device.</p>

        <button className="logout-btn large" onClick={onLogout}>
          <LogOut size={17} />
          Logout
        </button>
      </section>

      <div className="full-span">
        <ChangePasswordCard onToast={setToast} />
      </div>
    </div>
  );
}

function Field({ label, children, full = false }) {
  return (
    <label className={full ? "field full" : "field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow">EXPENSE INTELLIGENCE</span>
            <h2>{title}</h2>
          </div>

          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);