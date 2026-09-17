import os
import logging
import calendar
import secrets
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO

from dotenv import load_dotenv
from flask import Flask, request, session, url_for, send_file, jsonify
from flask_wtf import CSRFProtect
from sqlalchemy import (
    Date, DateTime, Numeric, String, create_engine,
    func, select, text, inspect
)
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from openpyxl import Workbook

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

load_dotenv()
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://expense_user:admin@localhost:5432/expense_tracker")
SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")
HOST = os.environ.get("EXPENSE_TRACKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("EXPENSE_TRACKER_PORT", "5000"))

if not SECRET_KEY:
    raise RuntimeError("FLASK_SECRET_KEY is not configured. Add it to your .env file.")

app = Flask(__name__)
app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("FLASK_SESSION_COOKIE_SECURE", "0") == "1",
    MAX_CONTENT_LENGTH=4 * 1024 * 1024,
    UPLOAD_FOLDER=os.path.join(app.root_path, "static", "uploads"),
)
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
csrf = CSRFProtect(app)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    currency_code: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class Expense(Base):
    __tablename__ = "expenses"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    spent_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(250), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False, default="UPI")
    attachment: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class Income(Base):
    __tablename__ = "income"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    received_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(250), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False, default="Bank Transfer")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    icon: Mapped[str] = mapped_column(String(10), nullable=False, default="•")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class Budget(Base):
    __tablename__ = "budgets"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    month: Mapped[int] = mapped_column(nullable=False)
    year: Mapped[int] = mapped_column(nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


def account_exists():
    with Session(engine) as db:
        return db.scalar(select(User.id).limit(1)) is not None


def money(value):
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def parse_amount(value):
    amount = Decimal(str(value or "").strip())
    if amount <= 0:
        raise ValueError
    return money(amount)


def password_problem(password):
    """Return a human-readable problem with the password, or None if it is fine."""
    password = password or ""
    if len(password) < 8:
        return "Password must contain at least 8 characters."
    if len(password) > 128:
        return "Password must be 128 characters or fewer."
    if not any(c.isalpha() for c in password):
        return "Password must contain at least one letter."
    if not any(c.isdigit() for c in password):
        return "Password must contain at least one number."
    if password.strip() != password:
        return "Password cannot start or end with a space."
    return None


ALLOWED_PAYMENT_METHODS = ["UPI", "Cash", "Debit Card", "Credit Card", "Bank Transfer", "Wallet"]
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "pdf"}


def save_attachment(file):
    if not file or not file.filename:
        return None
    original = secure_filename(file.filename)
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported attachment type. Use PDF, PNG, JPG or WEBP.")
    filename = f"{secrets.token_hex(12)}.{ext}"
    file.save(os.path.join(app.config["UPLOAD_FOLDER"], filename))
    return filename


def seed_categories():
    defaults = [
        ("Food", "🍔"), ("Transport", "🚗"), ("Bills", "💡"),
        ("Shopping", "🛍️"), ("Travel", "✈️"), ("Health", "💊"),
        ("Education", "🎓"), ("Entertainment", "🎬"), ("Rent", "🏠"),
        ("Other", "•")
    ]
    with Session(engine) as db:
        existing = {x.name.lower() for x in db.scalars(select(Category)).all()}
        for name, icon in defaults:
            if name.lower() not in existing:
                db.add(Category(name=name, icon=icon))
        db.commit()


def migrate_existing_schema():
    """Create new tables and add missing columns to existing tables."""
    Base.metadata.create_all(engine)
    try:
        insp = inspect(engine)
        cols = {c["name"] for c in insp.get_columns("expenses")}
        user_cols = {c["name"] for c in insp.get_columns("users")}
        with engine.begin() as conn:
            if "payment_method" not in cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN payment_method VARCHAR(40) NOT NULL DEFAULT 'UPI'"))
            if "attachment" not in cols:
                conn.execute(text("ALTER TABLE expenses ADD COLUMN attachment VARCHAR(255)"))
            if "full_name" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR(120) NOT NULL DEFAULT ''"))
            if "currency_code" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN currency_code VARCHAR(8) NOT NULL DEFAULT 'INR'"))
        seed_categories()
    except Exception:
        logger.exception("Database migration failed.")
        raise


CURRENCIES = {
    "INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "AED": "د.إ",
    "JPY": "¥", "AUD": "A$", "CAD": "C$", "SGD": "S$", "CHF": "CHF",
}
CURRENCY_NAMES = {
    "INR": "Indian Rupee (₹)", "USD": "US Dollar ($)", "EUR": "Euro (€)",
    "GBP": "British Pound (£)", "AED": "UAE Dirham (د.إ)", "JPY": "Japanese Yen (¥)",
    "AUD": "Australian Dollar (A$)", "CAD": "Canadian Dollar (C$)",
    "SGD": "Singapore Dollar (S$)", "CHF": "Swiss Franc (CHF)",
}


def api_auth_required():
    uid = session.get("user_id")
    if not uid:
        return None, (jsonify({"error": "Authentication required"}), 401)
    return uid, None


def serialize_user(user):
    return {
        "id": user.id, "username": user.username,
        "full_name": user.full_name or user.username,
        "currency": user.currency_code or "INR",
        "currency_symbol": CURRENCIES.get(user.currency_code or "INR", "₹"),
    }


def serialize_expense(e):
    return {
        "id": e.id, "date": e.spent_on.isoformat(), "description": e.description,
        "category": e.category, "payment": e.payment_method, "amount": float(e.amount),
        "attachment": e.attachment,
        "attachment_url": (url_for("static", filename=f"uploads/{e.attachment}") if e.attachment else None),
    }


def serialize_income(i):
    return {
        "id": i.id, "date": i.received_on.isoformat(), "source": i.source,
        "description": i.description, "payment": i.payment_method, "amount": float(i.amount),
    }


# ----------------------------- Auth API -----------------------------

@app.post("/api/register")
@csrf.exempt
def api_register():
    try:
        if account_exists():
            return jsonify({"error": "An account already exists. Please log in."}), 409
    except SQLAlchemyError:
        logger.exception("Unable to access the account database.")
        return jsonify({"error": "Unable to access the account database."}), 500

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    confirm = data.get("confirm_password", password)

    if not 3 <= len(username) <= 80:
        return jsonify({"error": "Username must contain 3 to 80 characters."}), 400
    problem = password_problem(password)
    if problem:
        return jsonify({"error": problem}), 400
    if password != confirm:
        return jsonify({"error": "Passwords do not match."}), 400

    try:
        with Session(engine) as db:
            if db.scalar(select(User.id).limit(1)):
                return jsonify({"error": "An account already exists. Please log in."}), 409
            user = User(
                username=username,
                password_hash=generate_password_hash(password),
                full_name=username,
                currency_code="INR",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            session.clear()
            session["user_id"] = user.id
            session["username"] = user.username
            return jsonify({"user": serialize_user(user)}), 201
    except IntegrityError:
        return jsonify({"error": "An account already exists. Please log in."}), 409
    except SQLAlchemyError:
        logger.exception("Registration error.")
        return jsonify({"error": "Unable to create the account."}), 500


@app.post("/api/login")
@csrf.exempt
def api_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.username == username))
        if not user or not check_password_hash(user.password_hash, password):
            return jsonify({"error": "Invalid username or password."}), 401
        session.clear()
        session["user_id"] = user.id
        session["username"] = user.username
        return jsonify({"user": serialize_user(user)})


@app.post("/api/logout")
@csrf.exempt
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
@csrf.exempt
def api_me():
    uid, error = api_auth_required()
    if error:
        return error
    with Session(engine) as db:
        user = db.get(User, uid)
        if not user:
            session.clear()
            return jsonify({"error": "Authentication required"}), 401
        return jsonify({"user": serialize_user(user)})


# ----------------------------- Security -----------------------------

@app.post("/api/change-password")
@csrf.exempt
def api_change_password():
    uid, error = api_auth_required()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""
    confirm_password = data.get("confirm_password") or ""

    if not current_password:
        return jsonify({"error": "Enter your current password."}), 400

    problem = password_problem(new_password)
    if problem:
        return jsonify({"error": problem}), 400

    if new_password != confirm_password:
        return jsonify({"error": "The new passwords do not match."}), 400

    if new_password == current_password:
        return jsonify({"error": "The new password must be different from the current one."}), 400

    try:
        with Session(engine) as db:
            user = db.get(User, uid)
            if not user:
                session.clear()
                return jsonify({"error": "Authentication required"}), 401

            if not check_password_hash(user.password_hash, current_password):
                return jsonify({"error": "Your current password is incorrect."}), 401

            user.password_hash = generate_password_hash(new_password)
            db.commit()
            username = user.username

        session.clear()
        session["user_id"] = uid
        session["username"] = username

        logger.info("Password changed for user id=%s", uid)
        return jsonify({"ok": True, "message": "Password changed successfully."})
    except SQLAlchemyError:
        logger.exception("Password change failed.")
        return jsonify({"error": "Database error while changing the password."}), 500


# ----------------------------- Dashboard / Transactions -----------------------------

def shift_month(year, month, delta):
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def month_bounds(year, month):
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return start, end


def percent_change(current, previous):
    current, previous = float(current or 0), float(previous or 0)
    if previous <= 0:
        return None
    return round((current - previous) / previous * 100, 1)


def build_trend(expenses, incomes, months=6):
    today_date = date.today()
    buckets = []
    for offset in range(months - 1, -1, -1):
        y, m = shift_month(today_date.year, today_date.month, -offset)
        buckets.append({
            "key": f"{y:04d}-{m:02d}",
            "label": date(y, m, 1).strftime("%b"),
            "year": y,
            "month": m,
            "income": 0.0,
            "expense": 0.0,
        })
    index = {b["key"]: b for b in buckets}
    for e in expenses:
        bucket = index.get(e.spent_on.strftime("%Y-%m"))
        if bucket:
            bucket["expense"] += float(e.amount)
    for i in incomes:
        bucket = index.get(i.received_on.strftime("%Y-%m"))
        if bucket:
            bucket["income"] += float(i.amount)
    for bucket in buckets:
        bucket["expense"] = round(bucket["expense"], 2)
        bucket["income"] = round(bucket["income"], 2)
        bucket["balance"] = round(bucket["income"] - bucket["expense"], 2)
    return buckets


@app.get("/api/dashboard")
@csrf.exempt
def api_dashboard():
    uid, error = api_auth_required()
    if error:
        return error

    with Session(engine) as db:
        expenses = db.scalars(select(Expense).order_by(Expense.spent_on.desc(), Expense.id.desc())).all()
        incomes = db.scalars(select(Income).order_by(Income.received_on.desc(), Income.id.desc())).all()
        budgets = db.scalars(select(Budget).order_by(Budget.year.desc(), Budget.month.desc(), Budget.category)).all()
        cats = db.scalars(select(Category).order_by(Category.name)).all()
        user = db.get(User, uid)

    today_date = date.today()
    year, month = today_date.year, today_date.month
    month_start, month_end = month_bounds(year, month)
    prev_year, prev_month = shift_month(year, month, -1)
    prev_start, prev_end = month_bounds(prev_year, prev_month)

    total_exp = sum((e.amount for e in expenses), Decimal("0"))
    total_inc = sum((i.amount for i in incomes), Decimal("0"))

    month_expenses = [e for e in expenses if month_start <= e.spent_on < month_end]
    month_incomes = [i for i in incomes if month_start <= i.received_on < month_end]
    prev_expenses = [e for e in expenses if prev_start <= e.spent_on < prev_end]
    prev_incomes = [i for i in incomes if prev_start <= i.received_on < prev_end]

    month_exp_total = float(sum((e.amount for e in month_expenses), Decimal("0")))
    month_inc_total = float(sum((i.amount for i in month_incomes), Decimal("0")))
    prev_exp_total = float(sum((e.amount for e in prev_expenses), Decimal("0")))
    prev_inc_total = float(sum((i.amount for i in prev_incomes), Decimal("0")))

    category_totals, month_category_totals = {}, {}
    for e in expenses:
        category_totals[e.category] = round(category_totals.get(e.category, 0) + float(e.amount), 2)
    for e in month_expenses:
        month_category_totals[e.category] = round(month_category_totals.get(e.category, 0) + float(e.amount), 2)

    current_budgets = [b for b in budgets if b.year == year and b.month == month]
    total_budget = float(sum((b.amount for b in current_budgets), Decimal("0")))

    budget_status = []
    for b in current_budgets:
        amount = float(b.amount)
        spent = month_category_totals.get(b.category, 0.0)
        used_pct = round(spent / amount * 100, 1) if amount > 0 else 0.0
        budget_status.append({
            "id": b.id,
            "category": b.category,
            "month": b.month,
            "year": b.year,
            "amount": amount,
            "spent": round(spent, 2),
            "remaining": round(amount - spent, 2),
            "used_pct": used_pct,
            "state": "over" if used_pct > 100 else ("warning" if used_pct >= 80 else "safe"),
        })
    budget_status.sort(key=lambda b: b["used_pct"], reverse=True)

    days_in_month = calendar.monthrange(year, month)[1]
    days_elapsed = today_date.day
    avg_daily = round(month_exp_total / days_elapsed, 2) if days_elapsed else 0.0
    projected = round(avg_daily * days_in_month, 2)

    top_category = None
    if month_category_totals:
        name, amount = max(month_category_totals.items(), key=lambda kv: kv[1])
        top_category = {"name": name, "amount": round(amount, 2)}

    biggest = max(month_expenses, key=lambda e: e.amount, default=None)
    biggest_expense = {
        "description": biggest.description,
        "category": biggest.category,
        "amount": float(biggest.amount),
        "date": biggest.spent_on.isoformat(),
    } if biggest else None

    savings_rate = round((month_inc_total - month_exp_total) / month_inc_total * 100, 1) if month_inc_total > 0 else None

    recent = [{
        "id": e.id, "type": "Expense", "date": e.spent_on.isoformat(),
        "title": e.description, "category": e.category,
        "payment": e.payment_method, "amount": float(e.amount),
        "attachment_url": (url_for("static", filename=f"uploads/{e.attachment}") if e.attachment else None),
    } for e in expenses[:25]]
    recent += [{
        "id": i.id, "type": "Income", "date": i.received_on.isoformat(),
        "title": i.description, "category": i.source,
        "payment": i.payment_method, "amount": float(i.amount),
        "attachment_url": None,
    } for i in incomes[:25]]
    recent.sort(key=lambda r: (r["date"], r["id"]), reverse=True)
    recent = recent[:8]

    return jsonify({
        "user": serialize_user(user),
        "expenses": [serialize_expense(e) for e in expenses[:100]],
        "income": [serialize_income(i) for i in incomes[:100]],
        "categories": [{"id": c.id, "name": c.name, "icon": c.icon} for c in cats],
        "budgets": [{"id": b.id, "category": b.category, "month": b.month, "year": b.year, "amount": float(b.amount)} for b in budgets],
        "totals": {
            "income": float(total_inc),
            "expense": float(total_exp),
            "balance": float(total_inc - total_exp),
            "budget": total_budget,
        },
        "category_totals": category_totals,
        "month_category_totals": month_category_totals,
        "budget_status": budget_status,
        "recent": recent,
        "trend": build_trend(expenses, incomes, months=6),
        "insights": {
            "period_label": month_start.strftime("%B %Y"),
            "month_expense": round(month_exp_total, 2),
            "month_income": round(month_inc_total, 2),
            "month_balance": round(month_inc_total - month_exp_total, 2),
            "prev_month_expense": round(prev_exp_total, 2),
            "prev_month_income": round(prev_inc_total, 2),
            "expense_change_pct": percent_change(month_exp_total, prev_exp_total),
            "income_change_pct": percent_change(month_inc_total, prev_inc_total),
            "avg_daily_spend": avg_daily,
            "projected_expense": projected,
            "days_elapsed": days_elapsed,
            "days_in_month": days_in_month,
            "savings_rate": savings_rate,
            "month_txn_count": len(month_expenses) + len(month_incomes),
            "month_expense_count": len(month_expenses),
            "top_category": top_category,
            "biggest_expense": biggest_expense,
            "budget_total": total_budget,
            "budget_spent": round(sum(b["spent"] for b in budget_status), 2),
            "budget_remaining": round(total_budget - sum(b["spent"] for b in budget_status), 2),
            "budget_used_pct": round(sum(b["spent"] for b in budget_status) / total_budget * 100, 1) if total_budget > 0 else 0.0,
            "over_budget_count": sum(1 for b in budget_status if b["state"] == "over"),
            "unbudgeted_categories": sorted(set(month_category_totals) - {b["category"] for b in budget_status}),
        },
    })


@app.get("/api/transactions")
@csrf.exempt
def api_transactions():
    uid, error = api_auth_required()
    if error:
        return error
    q = request.args.get("q", "").strip().lower()
    start = request.args.get("start_date", "").strip()
    end = request.args.get("end_date", "").strip()
    category = request.args.get("category", "").strip()
    payment = request.args.get("payment_method", "").strip()
    kind = request.args.get("kind", "all")
    min_amount = request.args.get("min_amount", "").strip()
    max_amount = request.args.get("max_amount", "").strip()
    with Session(engine) as db:
        expenses = db.scalars(select(Expense).order_by(Expense.spent_on.desc(), Expense.id.desc())).all()
        incomes = db.scalars(select(Income).order_by(Income.received_on.desc(), Income.id.desc())).all()

    def match_text(obj):
        return not q or q in (getattr(obj, "description", "") + " " + getattr(obj, "category", getattr(obj, "source", ""))).lower()

    try:
        sd = date.fromisoformat(start) if start else None
        ed = date.fromisoformat(end) if end else None
    except ValueError:
        return jsonify({"error": "Invalid date range."}), 400

    def common(obj, d):
        return (not sd or d >= sd) and (not ed or d <= ed) and (not payment or obj.payment_method == payment) and (not min_amount or obj.amount >= parse_amount(min_amount)) and (not max_amount or obj.amount <= parse_amount(max_amount))

    expenses = [e for e in expenses if match_text(e) and (not category or e.category == category) and common(e, e.spent_on)]
    incomes = [i for i in incomes if match_text(i) and common(i, i.received_on)]
    if kind == "expense": incomes = []
    if kind == "income": expenses = []
    return jsonify({"expenses": [serialize_expense(e) for e in expenses], "income": [serialize_income(i) for i in incomes]})


# ----------------------------- Expenses -----------------------------

@app.post("/api/expenses")
@csrf.exempt
def api_add_expense():
    uid, error = api_auth_required()
    if error:
        return error
    try:
        spent_on = date.fromisoformat(request.form.get("date", ""))
        amount = parse_amount(request.form.get("amount"))
        category = request.form.get("category", "").strip()
        description = request.form.get("description", "").strip()
        payment = request.form.get("payment", "UPI").strip()
        if not category or not description or payment not in ALLOWED_PAYMENT_METHODS:
            raise ValueError("Complete all expense fields.")
        attachment = save_attachment(request.files.get("attachment"))
        with Session(engine) as db:
            e = Expense(spent_on=spent_on, amount=amount, category=category, description=description, payment_method=payment, attachment=attachment)
            db.add(e)
            db.commit()
            db.refresh(e)
            return jsonify({"expense": serialize_expense(e)}), 201
    except (ValueError, InvalidOperation) as exc:
        return jsonify({"error": str(exc) or "Invalid expense details."}), 400
    except SQLAlchemyError:
        logger.exception("API expense save failed")
        return jsonify({"error": "Database error while saving expense."}), 500


@app.get("/api/expenses/<int:expense_id>")
@csrf.exempt
def api_get_expense(expense_id):
    uid, error = api_auth_required()
    if error:
        return error
    with Session(engine) as db:
        e = db.get(Expense, expense_id)
        if not e:
            return jsonify({"error": "Expense not found."}), 404
        return jsonify({"expense": serialize_expense(e)})


@app.patch("/api/expenses/<int:expense_id>")
@csrf.exempt
def api_update_expense(expense_id):
    uid, error = api_auth_required()
    if error:
        return error
    try:
        with Session(engine) as db:
            e = db.get(Expense, expense_id)
            if not e:
                return jsonify({"error": "Expense not found."}), 404
            data = request.form if request.form else (request.get_json(silent=True) or {})
            e.spent_on = date.fromisoformat(data.get("date", e.spent_on.isoformat()))
            e.amount = parse_amount(data.get("amount", str(e.amount)))
            e.category = (data.get("category") or e.category).strip()
            e.description = (data.get("description") or e.description).strip()
            e.payment_method = (data.get("payment") or e.payment_method).strip()
            if request.files.get("attachment"):
                if e.attachment:
                    old = os.path.join(app.config["UPLOAD_FOLDER"], e.attachment)
                    if os.path.exists(old):
                        os.remove(old)
                e.attachment = save_attachment(request.files.get("attachment"))
            db.commit()
            db.refresh(e)
            return jsonify({"expense": serialize_expense(e)})
    except (ValueError, InvalidOperation) as exc:
        return jsonify({"error": str(exc) or "Invalid expense data."}), 400


@app.delete("/api/expenses/<int:expense_id>")
@csrf.exempt
def api_delete_expense(expense_id):
    uid, error = api_auth_required()
    if error:
        return error
    with Session(engine) as db:
        e = db.get(Expense, expense_id)
        if not e:
            return jsonify({"error": "Expense not found."}), 404
        if e.attachment:
            fp = os.path.join(app.config["UPLOAD_FOLDER"], e.attachment)
            if os.path.exists(fp):
                os.remove(fp)
        db.delete(e)
        db.commit()
    return jsonify({"ok": True})


# ----------------------------- Income -----------------------------

@app.post("/api/income")
@csrf.exempt
def api_add_income():
    uid, error = api_auth_required()
    if error:
        return error
    try:
        data = request.get_json(silent=True) or {}
        received_on = date.fromisoformat(data.get("date", ""))
        amount = parse_amount(data.get("amount"))
        source = (data.get("source") or "").strip()
        description = (data.get("description") or "").strip()
        payment = data.get("payment", "Bank Transfer")
        if not source or not description or payment not in ALLOWED_PAYMENT_METHODS:
            raise ValueError("Complete all income fields.")
        with Session(engine) as db:
            i = Income(received_on=received_on, amount=amount, source=source, description=description, payment_method=payment)
            db.add(i)
            db.commit()
            db.refresh(i)
            return jsonify({"income": serialize_income(i)}), 201
    except (ValueError, InvalidOperation) as exc:
        return jsonify({"error": str(exc) or "Invalid income details."}), 400


@app.patch("/api/income/<int:income_id>")
@csrf.exempt
def api_update_income(income_id):
    uid, error = api_auth_required()
    if error:
        return error
    try:
        data = request.get_json(silent=True) or {}
        with Session(engine) as db:
            i = db.get(Income, income_id)
            if not i:
                return jsonify({"error": "Income not found."}), 404
            i.received_on = date.fromisoformat(data.get("date", i.received_on.isoformat()))
            i.amount = parse_amount(data.get("amount", str(i.amount)))
            i.source = (data.get("source") or i.source).strip()
            i.description = (data.get("description") or i.description).strip()
            i.payment_method = (data.get("payment") or i.payment_method).strip()
            db.commit()
            db.refresh(i)
            return jsonify({"income": serialize_income(i)})
    except (ValueError, InvalidOperation) as exc:
        return jsonify({"error": str(exc) or "Invalid income details."}), 400


@app.delete("/api/income/<int:income_id>")
@csrf.exempt
def api_delete_income(income_id):
    uid, error = api_auth_required()
    if error:
        return error
    with Session(engine) as db:
        i = db.get(Income, income_id)
        if not i:
            return jsonify({"error": "Income not found."}), 404
        db.delete(i)
        db.commit()
    return jsonify({"ok": True})


# ----------------------------- Budgets -----------------------------

@app.get("/api/budgets")
@csrf.exempt
def api_budgets():
    uid, error = api_auth_required()
    if error:
        return error
    with Session(engine) as db:
        rows = db.scalars(select(Budget).order_by(Budget.year.desc(), Budget.month.desc(), Budget.category)).all()
        return jsonify({"budgets": [{"id": b.id, "category": b.category, "month": b.month, "year": b.year, "amount": float(b.amount)} for b in rows]})


@app.post("/api/budgets")
@csrf.exempt
def api_add_budget():
    uid, error = api_auth_required()
    if error:
        return error
    try:
        data = request.get_json(silent=True) or {}
        category = (data.get("category") or "").strip()
        amount = parse_amount(data.get("amount"))
        month = int(data.get("month", date.today().month))
        year = int(data.get("year", date.today().year))
        if not category or amount <= 0 or not 1 <= month <= 12:
            raise ValueError("Enter a valid budget.")
        with Session(engine) as db:
            b = Budget(category=category, amount=amount, month=month, year=year)
            db.add(b)
            db.commit()
            db.refresh(b)
            return jsonify({
                "budget": {
                    "id": b.id,
                    "category": b.category,
                    "month": b.month,
                    "year": b.year,
                    "amount": float(b.amount)
                }
            }), 201
    except (ValueError, InvalidOperation) as exc:
        return jsonify({"error": str(exc) or "Invalid budget details."}), 400
    except SQLAlchemyError:
        logger.exception("API budget save failed")
        return jsonify({"error": "Database error while saving budget."}), 500


@app.delete("/api/budgets/<int:budget_id>")
@csrf.exempt
def api_delete_budget(budget_id):
    uid, error = api_auth_required()
    if error:
        return error
    with Session(engine) as db:
        b = db.get(Budget, budget_id)
        if not b:
            return jsonify({"error": "Budget not found."}), 404
        db.delete(b)
        db.commit()
    return jsonify({"ok": True})


# ----------------------------- Categories -----------------------------

@app.get("/api/categories")
@csrf.exempt
def api_categories():
    uid, error = api_auth_required()
    if error:
        return error
    with Session(engine) as db:
        cats = db.scalars(select(Category).order_by(Category.name)).all()
        return jsonify({"categories": [{"id": c.id, "name": c.name, "icon": c.icon} for c in cats]})


@app.post("/api/categories")
@csrf.exempt
def api_add_category():
    uid, error = api_auth_required()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    icon = (data.get("icon") or "•").strip()
    if not name:
        return jsonify({"error": "Category name is required."}), 400
    try:
        with Session(engine) as db:
            c = Category(name=name, icon=icon)
            db.add(c)
            db.commit()
            db.refresh(c)
            return jsonify({"category": {"id": c.id, "name": c.name, "icon": c.icon}}), 201
    except IntegrityError:
        return jsonify({"error": "Category already exists."}), 409
    except SQLAlchemyError:
        logger.exception("Category save failed")
        return jsonify({"error": "Database error while adding category."}), 500


# ----------------------------- Profile / Settings -----------------------------

@app.get("/api/profile")
@csrf.exempt
def api_get_profile():
    uid, error = api_auth_required()
    if error:
        return error
    with Session(engine) as db:
        user = db.get(User, uid)
        if not user:
            return jsonify({"error": "User not found."}), 404
        return jsonify({
            "user": serialize_user(user),
            "currencies": CURRENCY_NAMES,
        })


@app.patch("/api/profile")
@csrf.exempt
def api_update_profile():
    uid, error = api_auth_required()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    currency = (data.get("currency") or "INR").strip().upper()

    if currency not in CURRENCIES:
        return jsonify({"error": "Unsupported currency code."}), 400

    try:
        with Session(engine) as db:
            user = db.get(User, uid)
            if not user:
                return jsonify({"error": "User not found."}), 404
            if full_name:
                user.full_name = full_name
            user.currency_code = currency
            db.commit()
            db.refresh(user)
            return jsonify({"user": serialize_user(user)})
    except SQLAlchemyError:
        logger.exception("Profile update failed")
        return jsonify({"error": "Database error while updating profile."}), 500


# ----------------------------- Exports (PDF & Excel) -----------------------------

@app.get("/api/export/excel")
@csrf.exempt
def api_export_excel():
    uid, error = api_auth_required()
    if error:
        return error

    wb = Workbook()
    
    ws_exp = wb.active
    ws_exp.title = "Expenses"
    ws_exp.append(["ID", "Date", "Category", "Description", "Payment Method", "Amount"])

    ws_inc = wb.create_sheet(title="Income")
    ws_inc.append(["ID", "Date", "Source", "Description", "Payment Method", "Amount"])

    with Session(engine) as db:
        expenses = db.scalars(select(Expense).order_by(Expense.spent_on.desc())).all()
        incomes = db.scalars(select(Income).order_by(Income.received_on.desc())).all()

        for e in expenses:
            ws_exp.append([e.id, e.spent_on.isoformat(), e.category, e.description, e.payment_method, float(e.amount)])

        for i in incomes:
            ws_inc.append([i.id, i.received_on.isoformat(), i.source, i.description, i.payment_method, float(i.amount)])

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return send_file(
        buffer,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"financial_report_{date.today().isoformat()}.xlsx"
    )


@app.get("/api/export/pdf")
@csrf.exempt
def api_export_pdf():
    uid, error = api_auth_required()
    if error:
        return error

    with Session(engine) as db:
        user = db.get(User, uid)
        expenses = db.scalars(select(Expense).order_by(Expense.spent_on.desc())).all()
        incomes = db.scalars(select(Income).order_by(Income.received_on.desc())).all()

    currency_sym = CURRENCIES.get(user.currency_code if user else "INR", "₹")
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=15*mm, leftMargin=15*mm, topMargin=15*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()

    elements = []
    
    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=20,
        spaceAfter=12,
        textColor=colors.HexColor("#1e293b")
    )
    elements.append(Paragraph(f"Financial Statement - {user.full_name or user.username if user else 'User'}", title_style))
    elements.append(Paragraph(f"Generated on: {date.today().strftime('%B %d, %Y')}", styles['Normal']))
    elements.append(Spacer(1, 15))

    total_exp = sum((e.amount for e in expenses), Decimal("0"))
    total_inc = sum((i.amount for i in incomes), Decimal("0"))
    net_bal = total_inc - total_exp

    summary_data = [
        ["Total Income", "Total Expenses", "Net Balance"],
        [f"{currency_sym} {total_inc:,.2f}", f"{currency_sym} {total_exp:,.2f}", f"{currency_sym} {net_bal:,.2f}"]
    ]
    summary_table = Table(summary_data, colWidths=[60*mm, 60*mm, 60*mm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#334155")),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))

    elements.append(Paragraph("Recent Expenses", styles['Heading2']))
    elements.append(Spacer(1, 8))
    
    exp_data = [["Date", "Category", "Description", "Payment", f"Amount ({currency_sym})"]]
    for e in expenses[:50]:
        exp_data.append([
            e.spent_on.isoformat(),
            e.category,
            e.description[:30],
            e.payment_method,
            f"{e.amount:,.2f}"
        ])

    exp_table = Table(exp_data, colWidths=[25*mm, 35*mm, 60*mm, 30*mm, 30*mm])
    exp_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0284c7")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-2, -1), 'LEFT'),
        ('ALIGN', (-1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    elements.append(exp_table)

    doc.build(elements)
    buffer.seek(0)

    return send_file(
        buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"financial_report_{date.today().isoformat()}.pdf"
    )


# ----------------------------- App Initialization -----------------------------

with app.app_context():
    try:
        migrate_existing_schema()
    except Exception:
        logger.exception("Failed to initialize database schema on startup.")

if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=os.environ.get("FLASK_DEBUG", "0") == "1")
