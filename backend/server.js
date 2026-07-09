require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const tables = ["bills", "debts", "incomes", "expenses"];

const pool = mysql.createPool(getDatabaseConfig());

function getDatabaseConfig() {
  if (process.env.MYSQL_URL) {
    return {
      uri: process.env.MYSQL_URL,
      waitForConnections: true,
      connectionLimit: 10
    };
  }

  return {
    host: process.env.MYSQLHOST,
    port: Number(process.env.MYSQLPORT || 3306),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    waitForConnections: true,
    connectionLimit: 10
  };
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      category VARCHAR(120) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      dueDate DATE NOT NULL,
      status VARCHAR(40) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS debts (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      totalAmount DECIMAL(12, 2) NOT NULL,
      paidAmount DECIMAL(12, 2) NOT NULL,
      installments INT NOT NULL,
      nextDue DATE NOT NULL,
      status VARCHAR(40) NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS incomes (
      id VARCHAR(80) PRIMARY KEY,
      description VARCHAR(180) NOT NULL,
      category VARCHAR(120) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      date DATE NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id VARCHAR(80) PRIMARY KEY,
      description VARCHAR(180) NOT NULL,
      category VARCHAR(120) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      date DATE NOT NULL
    )
  `);
}

app.get("/api/health", async (request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true, database: "online" });
  } catch (error) {
    response.status(500).json({ ok: false, error: "database_offline" });
  }
});

app.get("/api/data", async (request, response) => {
  const [bills] = await pool.query("SELECT id, name, category, amount, DATE_FORMAT(dueDate, '%Y-%m-%d') AS dueDate, status FROM bills ORDER BY dueDate");
  const [debts] = await pool.query("SELECT id, name, totalAmount, paidAmount, installments, DATE_FORMAT(nextDue, '%Y-%m-%d') AS nextDue, status FROM debts ORDER BY nextDue");
  const [incomes] = await pool.query("SELECT id, description, category, amount, DATE_FORMAT(date, '%Y-%m-%d') AS date FROM incomes ORDER BY date DESC");
  const [expenses] = await pool.query("SELECT id, description, category, amount, DATE_FORMAT(date, '%Y-%m-%d') AS date FROM expenses ORDER BY date DESC");

  response.json({
    bills: normalizeNumbers(bills),
    debts: normalizeNumbers(debts),
    incomes: normalizeNumbers(incomes),
    expenses: normalizeNumbers(expenses)
  });
});

app.put("/api/data", async (request, response) => {
  const data = sanitizePayload(request.body);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const table of tables) {
      await connection.query(`DELETE FROM ${table}`);
    }

    for (const bill of data.bills) {
      await connection.query(
        "INSERT INTO bills (id, name, category, amount, dueDate, status) VALUES (?, ?, ?, ?, ?, ?)",
        [bill.id, bill.name, bill.category, bill.amount, bill.dueDate, bill.status]
      );
    }

    for (const debt of data.debts) {
      await connection.query(
        "INSERT INTO debts (id, name, totalAmount, paidAmount, installments, nextDue, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [debt.id, debt.name, debt.totalAmount, debt.paidAmount, debt.installments, debt.nextDue, debt.status]
      );
    }

    for (const income of data.incomes) {
      await connection.query(
        "INSERT INTO incomes (id, description, category, amount, date) VALUES (?, ?, ?, ?, ?)",
        [income.id, income.description, income.category, income.amount, income.date]
      );
    }

    for (const expense of data.expenses) {
      await connection.query(
        "INSERT INTO expenses (id, description, category, amount, date) VALUES (?, ?, ?, ?, ?)",
        [expense.id, expense.description, expense.category, expense.amount, expense.date]
      );
    }

    await connection.commit();
    response.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    response.status(500).json({ ok: false, error: "save_failed" });
  } finally {
    connection.release();
  }
});

function sanitizePayload(payload) {
  return {
    bills: Array.isArray(payload.bills) ? payload.bills : [],
    debts: Array.isArray(payload.debts) ? payload.debts : [],
    incomes: Array.isArray(payload.incomes) ? payload.incomes : [],
    expenses: Array.isArray(payload.expenses) ? payload.expenses : []
  };
}

function normalizeNumbers(records) {
  return records.map((record) => {
    const normalized = { ...record };

    ["amount", "totalAmount", "paidAmount"].forEach((field) => {
      if (field in normalized) {
        normalized[field] = Number(normalized[field]);
      }
    });

    return normalized;
  });
}

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`API online na porta ${port}`);
    });
  })
  .catch((error) => {
    console.error("Erro ao iniciar banco de dados:", error);
    process.exit(1);
  });
