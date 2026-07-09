const DB_NAME = "ControleFinanceiroDB";
const DB_VERSION = 1;
const OLD_STORAGE_KEY = "controleFinanceiroDataV1";
const STORE_NAMES = ["bills", "debts", "incomes", "expenses"];
const API_BASE_URL = (window.CONTROLE_FINANCEIRO_API_URL || "").replace(/\/$/, "");
let useApi = Boolean(API_BASE_URL);

const sampleData = {
  bills: [
    {
      id: "bill-energia",
      name: "Conta de luz",
      category: "Moradia",
      amount: 230,
      dueDate: "2026-07-15",
      status: "Pendente"
    },
    {
      id: "bill-internet",
      name: "Internet",
      category: "Serviços",
      amount: 119.9,
      dueDate: "2026-07-18",
      status: "Pendente"
    },
    {
      id: "bill-aluguel",
      name: "Aluguel",
      category: "Moradia",
      amount: 1450,
      dueDate: "2026-07-10",
      status: "Pago"
    }
  ],
  debts: [
    {
      id: "debt-cartao",
      name: "Cartão de crédito",
      totalAmount: 3500,
      paidAmount: 1200,
      installments: 10,
      nextDue: "2026-07-20",
      status: "Em andamento"
    },
    {
      id: "debt-emprestimo",
      name: "Empréstimo pessoal",
      totalAmount: 8000,
      paidAmount: 2500,
      installments: 24,
      nextDue: "2026-07-28",
      status: "Em andamento"
    }
  ],
  incomes: [
    {
      id: "income-salario",
      description: "Salário",
      category: "Trabalho",
      amount: 5200,
      date: "2026-07-05"
    },
    {
      id: "income-freela",
      description: "Freelance",
      category: "Extra",
      amount: 850,
      date: "2026-07-08"
    }
  ],
  expenses: [
    {
      id: "expense-mercado",
      description: "Mercado",
      category: "Alimentação",
      amount: 680,
      date: "2026-07-06"
    },
    {
      id: "expense-transporte",
      description: "Transporte",
      category: "Transporte",
      amount: 210,
      date: "2026-07-07"
    },
    {
      id: "expense-farmacia",
      description: "Farmácia",
      category: "Saúde",
      amount: 95,
      date: "2026-07-09"
    }
  ]
};

let db = null;
let state = createEmptyState();

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const pageTitles = {
  dashboard: "Dashboard",
  bills: "Contas a pagar",
  debts: "Dívidas",
  incomes: "Receitas",
  expenses: "Despesas",
  reports: "Relatórios",
  settings: "Configurações"
};

document.addEventListener("DOMContentLoaded", async () => {
  bindAutoLayout();
  bindNavigation();
  bindForms();
  bindActions();

  try {
    if (!useApi) {
      db = await openDatabase();
    }

    state = await loadState();
  } catch (error) {
    console.warn("API indisponivel. Usando banco local do navegador.", error);
    useApi = false;
    db = await openDatabase();
    state = await loadState();
  }

  renderAll();
});

function bindAutoLayout() {
  const applyLayout = () => {
    const width = window.innerWidth;
    const layout = width <= 720 ? "mobile" : width <= 1050 ? "tablet" : "desktop";

    document.documentElement.dataset.layout = layout;
    document.documentElement.style.setProperty("--viewport-height", `${window.innerHeight}px`);
  };

  applyLayout();
  window.addEventListener("resize", applyLayout);
  window.addEventListener("orientationchange", applyLayout);
}

function createEmptyState() {
  return {
    bills: [],
    debts: [],
    incomes: [],
    expenses: []
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Este navegador nao suporta IndexedDB."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      STORE_NAMES.forEach((storeName) => {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "id" });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadState() {
  if (useApi) {
    const apiState = await loadStateFromApi();

    if (hasRecords(apiState)) {
      return apiState;
    }

    await saveState(cloneData(sampleData));
    return cloneData(sampleData);
  }

  const loadedState = createEmptyState();

  for (const storeName of STORE_NAMES) {
    loadedState[storeName] = await getAllRecords(storeName);
  }

  if (hasRecords(loadedState)) {
    return loadedState;
  }

  const migratedState = loadOldLocalStorageState();
  const initialState = hasRecords(migratedState) ? migratedState : cloneData(sampleData);

  await saveState(initialState);
  return initialState;
}

function loadOldLocalStorageState() {
  const saved = localStorage.getItem(OLD_STORAGE_KEY);

  if (!saved) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(saved);

    return {
      bills: parsed.bills || [],
      debts: parsed.debts || [],
      incomes: parsed.incomes || [],
      expenses: parsed.expenses || []
    };
  } catch (error) {
    return createEmptyState();
  }
}

function hasRecords(data) {
  return STORE_NAMES.some((storeName) => data[storeName].length > 0);
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

async function saveState(data = state) {
  if (useApi) {
    await saveStateToApi(data);
    return;
  }

  for (const storeName of STORE_NAMES) {
    await replaceStoreRecords(storeName, data[storeName]);
  }
}

async function loadStateFromApi() {
  const response = await fetch(`${API_BASE_URL}/api/data`);

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar os dados da API.");
  }

  const data = await response.json();

  return {
    bills: data.bills || [],
    debts: data.debts || [],
    incomes: data.incomes || [],
    expenses: data.expenses || []
  };
}

async function saveStateToApi(data) {
  const response = await fetch(`${API_BASE_URL}/api/data`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel salvar os dados na API.");
  }
}

function getAllRecords(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function replaceStoreRecords(storeName, records) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    store.clear();
    records.forEach((record) => store.put(record));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function bindNavigation() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });
  });
}

function bindActions() {
  document.querySelector("[data-action='home']").addEventListener("click", showHome);

  document.querySelector("[data-action='seed']").addEventListener("click", async () => {
    state = cloneData(sampleData);
    await saveState();
    renderAll();
    showPage("dashboard");
  });

  document.querySelector("[data-action='clear']").addEventListener("click", async () => {
    const confirmed = window.confirm("Tem certeza que deseja apagar todos os dados?");

    if (!confirmed) {
      return;
    }

    state = createEmptyState();

    await saveState();
    renderAll();
  });

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete], [data-toggle-paid], [data-finish-debt]");

    if (!button) {
      return;
    }

    if (button.dataset.delete) {
      await deleteRecord(button.dataset.delete, button.dataset.id);
    }

    if (button.dataset.togglePaid) {
      await toggleBillStatus(button.dataset.id);
    }

    if (button.dataset.finishDebt) {
      await finishDebt(button.dataset.id);
    }
  });
}

function bindForms() {
  document.getElementById("billForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = readForm(event.currentTarget);

    state.bills.push({
      id: createId("bill"),
      name: data.name,
      category: data.category,
      amount: toNumber(data.amount),
      dueDate: data.dueDate,
      status: data.status
    });

    await finishForm(event.currentTarget);
  });

  document.getElementById("debtForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = readForm(event.currentTarget);

    state.debts.push({
      id: createId("debt"),
      name: data.name,
      totalAmount: toNumber(data.totalAmount),
      paidAmount: toNumber(data.paidAmount),
      installments: toNumber(data.installments),
      nextDue: data.nextDue,
      status: "Em andamento"
    });

    await finishForm(event.currentTarget);
  });

  document.getElementById("incomeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = readForm(event.currentTarget);

    state.incomes.push({
      id: createId("income"),
      description: data.description,
      category: data.category,
      amount: toNumber(data.amount),
      date: data.date
    });

    await finishForm(event.currentTarget);
  });

  document.getElementById("expenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = readForm(event.currentTarget);

    state.expenses.push({
      id: createId("expense"),
      description: data.description,
      category: data.category,
      amount: toNumber(data.amount),
      date: data.date
    });

    await finishForm(event.currentTarget);
  });
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function finishForm(form) {
  form.reset();
  await saveState();
  renderAll();
}

function showHome() {
  document.getElementById("homeScreen").classList.add("active");
  document.getElementById("appScreen").classList.remove("active");
}

function showPage(pageId) {
  document.getElementById("homeScreen").classList.remove("active");
  document.getElementById("appScreen").classList.add("active");

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".side-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  document.getElementById("pageTitle").textContent = pageTitles[pageId] || "Dashboard";
}

function renderAll() {
  renderDashboard();
  renderBills();
  renderDebts();
  renderIncomes();
  renderExpenses();
  renderReports();
}

function renderDashboard() {
  const month = currentMonth();
  const monthlyIncome = sum(state.incomes.filter((item) => isInMonth(item.date, month)), "amount");
  const monthlyExpense = sum(state.expenses.filter((item) => isInMonth(item.date, month)), "amount");
  const openDebt = state.debts.reduce((total, debt) => total + debtRemaining(debt), 0);

  document.getElementById("balanceValue").textContent = formatMoney(monthlyIncome - monthlyExpense);
  document.getElementById("incomeValue").textContent = formatMoney(monthlyIncome);
  document.getElementById("expenseValue").textContent = formatMoney(monthlyExpense);
  document.getElementById("debtValue").textContent = formatMoney(openDebt);

  const upcoming = state.bills
    .filter((bill) => bill.status !== "Pago")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  const activeDebts = state.debts
    .filter((debt) => debt.status !== "Quitada")
    .slice(0, 3);

  document.getElementById("upcomingBills").innerHTML = upcoming.length
    ? upcoming.map(renderCompactBill).join("")
    : emptyState("Nenhuma conta pendente.");

  document.getElementById("debtProgressList").innerHTML = activeDebts.length
    ? activeDebts.map(renderCompactDebt).join("")
    : emptyState("Nenhuma dívida em andamento.");
}

function renderBills() {
  const list = document.getElementById("billsList");

  list.innerHTML = state.bills.length
    ? state.bills
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((bill) => {
          const status = billStatus(bill);

          return `
            <article class="record-item">
              <div class="record-header">
                <div>
                  <p class="record-title">${escapeHtml(bill.name)}</p>
                  <div class="record-meta">
                    <span>${escapeHtml(bill.category)}</span>
                    <span>Vence em ${formatDate(bill.dueDate)}</span>
                    ${statusBadge(status)}
                  </div>
                </div>
                <div class="record-amount">${formatMoney(bill.amount)}</div>
              </div>
              <div class="record-actions">
                <button type="button" data-toggle-paid="true" data-id="${bill.id}">
                  ${bill.status === "Pago" ? "Marcar pendente" : "Marcar pago"}
                </button>
                <button type="button" data-delete="bills" data-id="${bill.id}">Excluir</button>
              </div>
            </article>
          `;
        })
        .join("")
    : emptyState("Nenhuma conta cadastrada.");
}

function renderDebts() {
  const list = document.getElementById("debtsList");

  list.innerHTML = state.debts.length
    ? state.debts.map(renderDebtRecord).join("")
    : emptyState("Nenhuma dívida cadastrada.");
}

function renderIncomes() {
  const list = document.getElementById("incomesList");

  list.innerHTML = state.incomes.length
    ? state.incomes
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((income) => `
          <article class="record-item">
            <div class="record-header">
              <div>
                <p class="record-title">${escapeHtml(income.description)}</p>
                <div class="record-meta">
                  <span>${escapeHtml(income.category)}</span>
                  <span>${formatDate(income.date)}</span>
                  ${statusBadge("Entrada")}
                </div>
              </div>
              <div class="record-amount">${formatMoney(income.amount)}</div>
            </div>
            <div class="record-actions">
              <button type="button" data-delete="incomes" data-id="${income.id}">Excluir</button>
            </div>
          </article>
        `)
        .join("")
    : emptyState("Nenhuma receita cadastrada.");
}

function renderExpenses() {
  const list = document.getElementById("expensesList");

  list.innerHTML = state.expenses.length
    ? state.expenses
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((expense) => `
          <article class="record-item">
            <div class="record-header">
              <div>
                <p class="record-title">${escapeHtml(expense.description)}</p>
                <div class="record-meta">
                  <span>${escapeHtml(expense.category)}</span>
                  <span>${formatDate(expense.date)}</span>
                  ${statusBadge("Saída", "danger")}
                </div>
              </div>
              <div class="record-amount">${formatMoney(expense.amount)}</div>
            </div>
            <div class="record-actions">
              <button type="button" data-delete="expenses" data-id="${expense.id}">Excluir</button>
            </div>
          </article>
        `)
        .join("")
    : emptyState("Nenhuma despesa cadastrada.");
}

function renderReports() {
  const month = currentMonth();
  const monthIncomes = state.incomes.filter((item) => isInMonth(item.date, month));
  const monthExpenses = state.expenses.filter((item) => isInMonth(item.date, month));
  const totalIncome = sum(monthIncomes, "amount");
  const totalExpense = sum(monthExpenses, "amount");
  const openBills = state.bills.filter((bill) => bill.status !== "Pago").length;

  document.getElementById("reportSummary").innerHTML = `
    ${reportLine("Receitas no mês", formatMoney(totalIncome))}
    ${reportLine("Despesas no mês", formatMoney(totalExpense))}
    ${reportLine("Saldo final", formatMoney(totalIncome - totalExpense))}
    ${reportLine("Contas pendentes", String(openBills))}
  `;

  renderBars("expenseBars", totalsByCategory(monthExpenses), "Nenhuma despesa neste mês.");
  renderBars("incomeBars", totalsByCategory(monthIncomes), "Nenhuma receita neste mês.");
}

function renderCompactBill(bill) {
  const status = billStatus(bill);

  return `
    <article class="record-item">
      <div class="record-header">
        <div>
          <p class="record-title">${escapeHtml(bill.name)}</p>
          <div class="record-meta">
            <span>${formatDate(bill.dueDate)}</span>
            ${statusBadge(status)}
          </div>
        </div>
        <div class="record-amount">${formatMoney(bill.amount)}</div>
      </div>
    </article>
  `;
}

function renderCompactDebt(debt) {
  const percent = debtPercent(debt);

  return `
    <article class="record-item">
      <div class="record-header">
        <div>
          <p class="record-title">${escapeHtml(debt.name)}</p>
          <div class="record-meta">
            <span>Restante: ${formatMoney(debtRemaining(debt))}</span>
            <span>Vence em ${formatDate(debt.nextDue)}</span>
          </div>
        </div>
        <div class="record-amount">${percent}%</div>
      </div>
      <div class="progress" aria-label="Progresso da dívida">
        <span style="width: ${percent}%"></span>
      </div>
    </article>
  `;
}

function renderDebtRecord(debt) {
  const percent = debtPercent(debt);

  return `
    <article class="record-item">
      <div class="record-header">
        <div>
          <p class="record-title">${escapeHtml(debt.name)}</p>
          <div class="record-meta">
            <span>Total: ${formatMoney(debt.totalAmount)}</span>
            <span>Pago: ${formatMoney(debt.paidAmount)}</span>
            <span>Restante: ${formatMoney(debtRemaining(debt))}</span>
            <span>${debt.installments} parcelas</span>
            <span>Próximo vencimento: ${formatDate(debt.nextDue)}</span>
            ${statusBadge(debt.status, debt.status === "Quitada" ? "" : "warning")}
          </div>
        </div>
        <div class="record-amount">${percent}% pago</div>
      </div>
      <div class="progress" aria-label="Progresso da dívida">
        <span style="width: ${percent}%"></span>
      </div>
      <div class="record-actions">
        <button type="button" data-finish-debt="true" data-id="${debt.id}">Marcar quitada</button>
        <button type="button" data-delete="debts" data-id="${debt.id}">Excluir</button>
      </div>
    </article>
  `;
}

function renderBars(elementId, totals, emptyMessage) {
  const container = document.getElementById(elementId);
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = entries.reduce((highest, item) => Math.max(highest, item[1]), 0);

  container.innerHTML = entries.length
    ? entries.map(([category, total]) => {
        const width = max ? Math.round((total / max) * 100) : 0;

        return `
          <div class="bar-row">
            <div class="bar-label">
              <span>${escapeHtml(category)}</span>
              <strong>${formatMoney(total)}</strong>
            </div>
            <div class="bar-track"><span style="width: ${width}%"></span></div>
          </div>
        `;
      }).join("")
    : emptyState(emptyMessage);
}

async function deleteRecord(collection, id) {
  state[collection] = state[collection].filter((item) => item.id !== id);
  await saveState();
  renderAll();
}

async function toggleBillStatus(id) {
  state.bills = state.bills.map((bill) => {
    if (bill.id !== id) {
      return bill;
    }

    return {
      ...bill,
      status: bill.status === "Pago" ? "Pendente" : "Pago"
    };
  });

  await saveState();
  renderAll();
}

async function finishDebt(id) {
  state.debts = state.debts.map((debt) => {
    if (debt.id !== id) {
      return debt;
    }

    return {
      ...debt,
      paidAmount: debt.totalAmount,
      status: "Quitada"
    };
  });

  await saveState();
  renderAll();
}

function currentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function isInMonth(date, month) {
  return typeof date === "string" && date.startsWith(month);
}

function billStatus(bill) {
  const today = localDateISO();

  if (bill.status === "Pago") {
    return "Pago";
  }

  return bill.dueDate < today ? "Vencida" : "Pendente";
}

function localDateISO() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function debtRemaining(debt) {
  return Math.max(0, toNumber(debt.totalAmount) - toNumber(debt.paidAmount));
}

function debtPercent(debt) {
  if (!debt.totalAmount) {
    return 0;
  }

  return Math.min(100, Math.round((toNumber(debt.paidAmount) / toNumber(debt.totalAmount)) * 100));
}

function totalsByCategory(items) {
  return items.reduce((totals, item) => {
    const category = item.category || "Sem categoria";
    totals[category] = (totals[category] || 0) + toNumber(item.amount);
    return totals;
  }, {});
}

function sum(items, field) {
  return items.reduce((total, item) => total + toNumber(item[field]), 0);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return currency.format(toNumber(value));
}

function formatDate(dateString) {
  if (!dateString) {
    return "-";
  }

  return new Date(`${dateString}T12:00:00`).toLocaleDateString("pt-BR");
}

function createId(prefix) {
  if (window.crypto && window.crypto.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusBadge(text, type = "") {
  const className = type ? `badge ${type}` : "badge";
  return `<span class="${className}">${escapeHtml(text)}</span>`;
}

function reportLine(label, value) {
  return `
    <div class="report-line">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
