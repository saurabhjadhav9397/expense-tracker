import React, { useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Receipt,
  TrendingUp,
  PieChart,
  Grid,
  User,
  Settings as SettingsIcon,
  Plus,
  RefreshCw,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  Edit,
  DollarSign
} from "lucide-react";

// --- HELPER FUNCTIONS ---
const money = (val, symbol = "$") =>
  `${symbol}${Number(val || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateLabel = (d) => new Date(d).toLocaleDateString();

// --- DUMMY INITIAL DATA ---
const INITIAL_TRANSACTIONS = [
  { id: 1, type: "Expense", category: "Housing", amount: 1200, date: "2026-03-01", title: "Rent payment", payment: "Bank Transfer" },
  { id: 2, type: "Expense", category: "Food", amount: 150, date: "2026-03-03", title: "Grocery runs", payment: "Credit Card" },
  { id: 3, type: "Income", category: "Salary", amount: 3500, date: "2026-03-05", title: "Monthly Paycheck", payment: "Direct Deposit" },
  { id: 4, type: "Expense", category: "Entertainment", amount: 45, date: "2026-03-10", title: "Streaming Services", payment: "Credit Card" },
];

const INITIAL_BUDGETS = [
  { category: "Housing", amount: 1200 },
  { category: "Food", amount: 500 },
  { category: "Entertainment", amount: 200 },
];

// --- MAIN APP COMPONENT ---
export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);
  const [budgets, setBudgets] = useState(INITIAL_BUDGETS);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Derived metrics
  const totalIncome = useMemo(
    () => transactions.filter((t) => t.type === "Income").reduce((a, b) => a + b.amount, 0),
    [transactions]
  );

  const totalExpense = useMemo(
    () => transactions.filter((t) => t.type === "Expense").reduce((a, b) => a + b.amount, 0),
    [transactions]
  );

  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome ? (netSavings / totalIncome) * 100 : 0;

  // Category summary calculations
  const catSummary = useMemo(() => {
    const map = {};
    transactions
      .filter((t) => t.type === "Expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return Object.entries(map).map(([category, amount]) => ({ category, amount }));
  }, [transactions]);

  const budgetStatus = useMemo(() => {
    return budgets.map((b) => {
      const spent = transactions
        .filter((t) => t.type === "Expense" && t.category === b.category)
        .reduce((sum, t) => sum + t.amount, 0);
      return { ...b, spent, percentage: (spent / b.amount) * 100 };
    });
  }, [budgets, transactions]);

  const addTransaction = (item) => {
    setTransactions((prev) => [{ ...item, id: Date.now() }, ...prev]);
    setIsModalOpen(false);
  };

  const deleteTransaction = (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <DollarSign size={24} /> <h2>FinanceTracker</h2>
        </div>
        <nav className="nav-menu">
          <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button className={activeTab === "transactions" ? "active" : ""} onClick={() => setActiveTab("transactions")}>
            <Receipt size={18} /> Transactions
          </button>
          <button className={activeTab === "income" ? "active" : ""} onClick={() => setActiveTab("income")}>
            <TrendingUp size={18} /> Income
          </button>
          <button className={activeTab === "budgets" ? "active" : ""} onClick={() => setActiveTab("budgets")}>
            <PieChart size={18} /> Budgets
          </button>
          <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")}>
            <SettingsIcon size={18} /> Settings
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="top-bar">
          <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
          <button className="primary-btn" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} /> Add Transaction
          </button>
        </header>

        {activeTab === "dashboard" && (
          <Dashboard
            ins={{ savings_amount: netSavings, savings_rate: savingsRate, income: totalIncome, expense: totalExpense }}
            symbol={currencySymbol}
            trend={[]}
            topCats={catSummary}
            catTotal={totalExpense}
            activity={transactions.slice(0, 5)}
            status={budgetStatus}
            scope="month"
            setScope={() => {}}
            onRefresh={() => {}}
            onTransactions={() => setActiveTab("transactions")}
            onBudget={() => setActiveTab("budgets")}
          />
        )}

        {activeTab === "transactions" && (
          <TransactionsPage transactions={transactions} symbol={currencySymbol} onDelete={deleteTransaction} />
        )}

        {activeTab === "income" && (
          <IncomePage transactions={transactions.filter((t) => t.type === "Income")} symbol={currencySymbol} />
        )}

        {activeTab === "budgets" && (
          <BudgetsPage budgets={budgetStatus} symbol={currencySymbol} />
        )}

        {activeTab === "settings" && (
          <SettingsPage symbol={currencySymbol} setSymbol={setCurrencySymbol} />
        )}
      </main>

      {/* Quick Add Modal */}
      {isModalOpen && (
        <TransactionModal
          onClose={() => setIsModalOpen(false)}
          onSave={addTransaction}
        />
      )}
    </div>
  );
}

// --- DASHBOARD SUB-COMPONENT ---
function Dashboard({
  ins,
  symbol,
  trend,
  topCats,
  catTotal,
  activity,
  status,
  scope,
  setScope,
  onRefresh,
  onTransactions,
  onBudget,
}) {
  return (
    <>
      <div className="metrics-row">
        <div className="metric-card">
          <span>Total Income</span>
          <h2>{money(ins.income, symbol)}</h2>
        </div>
        <div className="metric-card">
          <span>Total Expenses</span>
          <h2>{money(ins.expense, symbol)}</h2>
        </div>
        <div className="metric-card">
          <span>Net Savings</span>
          <h2>{money(ins.savings_amount, symbol)}</h2>
          <small>
            {ins.savings_rate === null || ins.savings_rate === undefined
              ? "No income recorded this month"
              : `${money(ins.savings_amount, symbol)} saved`}
          </small>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>6-Month Financial Trend</h3>
              <p>Income versus expenses over recent months</p>
            </div>
            <button className="icon-btn" onClick={onRefresh} title="Refresh data">
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="placeholder-chart">[ Trend Chart Placeholder ]</div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Spending by Category</h3>
              <p>Breakdown of your major expense areas</p>
            </div>
            <div className="tab-pills">
              <button className={scope === "month" ? "active" : ""} onClick={() => setScope("month")}>Month</button>
              <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>All Time</button>
            </div>
          </div>
          <div className="placeholder-chart">
            {topCats.map((c) => (
              <div key={c.category} className="cat-line">
                <span>{c.category}</span>
                <span>{money(c.amount, symbol)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-grid bottom">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Recent Activity</h3>
              <p>Your latest incoming and outgoing transactions</p>
            </div>
            <button className="text-btn" onClick={onTransactions}>
              View all <ChevronRight size={15} />
            </button>
          </div>

          <div className="activity-list">
            {!activity.length ? (
              <div className="empty">No recent transactions found.</div>
            ) : (
              activity.map((item) => (
                <div key={`${item.type}-${item.id}`} className="activity-item">
                  <div className={`activity-icon ${item.type === "Income" ? "income" : "expense"}`}>
                    {item.type === "Income" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  </div>
                  <div className="activity-details">
                    <strong>{item.title || item.category || "Transaction"}</strong>
                    <span>{dateLabel(item.date)} • {item.category} • {item.payment || "Other"}</span>
                  </div>
                  <div className={`activity-amount ${item.type === "Income" ? "positive" : "negative"}`}>
                    {item.type === "Income" ? "+" : "-"}
                    {money(item.amount, symbol)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Budget Allocation</h3>
              <p>Active targets for the current period</p>
            </div>
            <button className="text-btn" onClick={onBudget}>
              Manage budgets <ChevronRight size={15} />
            </button>
          </div>

          <div className="budget-list">
            {!status.length ? (
              <div className="empty">No active budgets found for this month.</div>
            ) : (
              status.map((b) => {
                const pct = Number(b.percentage || 0);
                return (
                  <div key={b.category} className="budget-item">
                    <div className="budget-info">
                      <strong>{b.category}</strong>
                      <span>{money(b.spent, symbol)} of {money(b.amount, symbol)}</span>
                    </div>
                    <div className="progress">
                      <div className={pct > 100 ? "bar over" : pct >= 80 ? "bar warn" : "bar"} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <small className={pct > 100 ? "text-red" : pct >= 80 ? "text-orange" : "text-sub"}>
                      {pct > 100
                        ? `${money(b.spent - b.amount, symbol)} over limit`
                        : `${money(b.amount - b.spent, symbol)} remaining (${pct.toFixed(0)}%)`}
                    </small>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// --- TRANSACTIONS PAGE ---
function TransactionsPage({ transactions, symbol, onDelete }) {
  return (
    <div className="card">
      <h3>All Transactions</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Category</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{t.title}</td>
              <td>{t.category}</td>
              <td>{t.date}</td>
              <td className={t.type === "Income" ? "positive" : "negative"}>
                {t.type === "Income" ? "+" : "-"}{money(t.amount, symbol)}
              </td>
              <td>
                <button className="icon-btn danger" onClick={() => onDelete(t.id)}>
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- INCOME PAGE ---
function IncomePage({ transactions, symbol }) {
  return (
    <div className="card">
      <h3>Income Sources</h3>
      <ul className="simple-list">
        {transactions.map((t) => (
          <li key={t.id}>
            <span>{t.title} ({t.category})</span>
            <strong className="positive">+{money(t.amount, symbol)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- BUDGETS PAGE ---
function BudgetsPage({ budgets, symbol }) {
  return (
    <div className="card">
      <h3>Budget Overview</h3>
      <div className="budget-grid-view">
        {budgets.map((b) => (
          <div key={b.category} className="budget-card">
            <h4>{b.category}</h4>
            <p>{money(b.spent, symbol)} / {money(b.amount, symbol)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- SETTINGS PAGE ---
function SettingsPage({ symbol, setSymbol }) {
  return (
    <div className="card">
      <h3>Preferences</h3>
      <div className="form-group">
        <label>Currency Symbol</label>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          <option value="$">USD ($)</option>
          <option value="€">EUR (€)</option>
          <option value="£">GBP (£)</option>
          <option value="₹">INR (₹)</option>
        </select>
      </div>
    </div>
  );
}

// --- MODAL COMPONENT ---
function TransactionModal({ onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [type, setType] = useState("Expense");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title || !amount) return;
    onSave({
      title,
      amount: parseFloat(amount),
      category,
      type,
      date: new Date().toISOString().split("T")[0],
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Add New Transaction</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Amount</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
            </select>
          </div>
          <div className="form-group">
            <label>Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} required />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-btn">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// RENDER INITIALIZATION
const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
