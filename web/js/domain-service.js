import { FINANCE_EXPENSE_FIELDS, FINANCE_INCOME_FIELDS } from "./config.js";
import { Format } from "./utils.js";

class DomainService {
  constructor(repo) {
    this.repo = repo;
  }

  summarizeFinance(rows) {
    const income = [0, 0, 0, 0];
    const expense = [0, 0, 0, 0];

    for (const row of rows) {
      for (let i = 0; i < FINANCE_INCOME_FIELDS.length; i += 1) {
        income[i] += Number(row[FINANCE_INCOME_FIELDS[i]]) || 0;
      }
      for (let i = 0; i < FINANCE_EXPENSE_FIELDS.length; i += 1) {
        expense[i] += Number(row[FINANCE_EXPENSE_FIELDS[i]]) || 0;
      }
    }

    const totalIncome = income.reduce((sum, value) => sum + value, 0);
    const totalExpense = expense.reduce((sum, value) => sum + value, 0);

    return {
      income,
      expense,
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense
    };
  }

  getTaiGroup(taiValue) {
    const tai = String(taiValue ?? "").toUpperCase();
    if (tai === "I1") return 1;
    if (tai === "I2") return 2;
    if (tai === "I3") return 3;
    return 4;
  }

  parseFinanceRow(row) {
    const incomeByCategory = FINANCE_INCOME_FIELDS.map((field) => Number(row[field]) || 0);
    const expenseByCategory = FINANCE_EXPENSE_FIELDS.map((field) => Number(row[field]) || 0);
    const incomeTotal = incomeByCategory.reduce((sum, value) => sum + value, 0);
    const expenseTotal = expenseByCategory.reduce((sum, value) => sum + value, 0);

    let type = "mixed";
    let category = "-";
    let amount = Math.abs(incomeTotal - expenseTotal);

    if (incomeTotal > 0 && expenseTotal === 0) {
      type = "income";
      const index = incomeByCategory.findIndex((value) => value > 0);
      category = index >= 0 ? String(index + 1) : "-";
      amount = incomeTotal;
    } else if (expenseTotal > 0 && incomeTotal === 0) {
      type = "expense";
      const index = expenseByCategory.findIndex((value) => value > 0);
      category = index >= 0 ? String(index + 1) : "-";
      amount = expenseTotal;
    } else if (incomeTotal === 0 && expenseTotal === 0) {
      type = "mixed";
      category = "-";
      amount = 0;
    }

    return {
      row,
      type,
      category,
      amount,
      incomeTotal,
      expenseTotal,
      date: row.outdate || row.exdate || null,
      year: row["ปี"] || "-",
      note: row["หมายเหตุ"] || row.outlist || "",
      editable: type === "income" || type === "expense"
    };
  }

  buildFinanceRow(form, baseRow, nextId) {
    const amount = Number(form.amount);
    const categoryIndex = Number(form.category);
    const type = form.type;

    const row = {
      ...baseRow,
      ID: Number(baseRow.ID) || nextId,
      "เลขที่": baseRow["เลขที่"] ?? null,
      outdate: type === "expense" ? Format.dateInputToIso(form.date) : null,
      "ปี": String(form.year),
      "รุ่น": Number(baseRow["รุ่น"] || 1),
      "รอบ": baseRow["รอบ"] ?? null,
      "รายรับ1": null,
      "รายรับ2": null,
      "รายรับ3": null,
      "รายรับ4": null,
      "รายจ่าย1": null,
      "รายจ่าย2": null,
      "รายจ่าย3": null,
      "รายจ่าย4": null,
      "หมายเหตุ": Format.cleanWhitespace(form.note) || null,
      "สถานะ": type === "income" ? 1 : 2,
      iout: baseRow.iout ?? null,
      sheck: baseRow.sheck ?? null,
      number: baseRow.number ?? null,
      name: baseRow.name ?? null,
      exdate: Format.dateInputToIso(form.date),
      outlist: baseRow.outlist ?? null,
      inid: baseRow.inid ?? null
    };

    if (type === "income") {
      row[`รายรับ${categoryIndex}`] = amount;
    } else {
      row[`รายจ่าย${categoryIndex}`] = amount;
    }

    return row;
  }

  async computeInventoryRows() {
    const [products, inRows, outRows] = await Promise.all([
      this.repo.getTable("t16_product"),
      this.repo.getTable("t09_intproduct"),
      this.repo.getTable("t13_outproduct")
    ]);

    const inMap = {};
    const outMap = {};

    for (const row of inRows) {
      const key = String(row.productID || "");
      inMap[key] = (inMap[key] || 0) + (Number(row.quantity) || 0);
    }

    for (const row of outRows) {
      const key = String(row.productID || "");
      outMap[key] = (outMap[key] || 0) + (Number(row.quantity) || 0);
    }

    return products.map((product) => {
      const productID = String(product.productID || "");
      const inQty = inMap[productID] || 0;
      const outQty = outMap[productID] || 0;
      const balance = inQty - outQty;
      const reorderPointRaw = Number(product.reorderPoint ?? product.threshold ?? 0);
      const reorderPoint = reorderPointRaw > 0 ? reorderPointRaw : Math.max(10, Math.ceil(Math.max(outQty, 10) * 0.2));

      let status = "ปกติ";
      if (balance <= 0) {
        status = "หมดคลัง";
      } else if (balance <= reorderPoint) {
        status = "ใกล้หมด";
      }

      const percent = Math.max(3, Math.min(100, Math.round((Math.max(balance, 0) / Math.max(reorderPoint * 2, 1)) * 100)));

      return {
        rowId: product.__rowid,
        product,
        productID,
        productName: String(product.productName || "-"),
        unit: String(product.unit || ""),
        price: Number(product.price) || 0,
        inQty,
        outQty,
        balance,
        reorderPoint,
        status,
        percent,
        stockValue: balance * (Number(product.price) || 0)
      };
    });
  }

  severityRank(status) {
    if (status === "หมดคลัง") return 0;
    if (status === "ใกล้หมด") return 1;
    return 2;
  }

  statusClass(status) {
    if (status === "หมดคลัง") return "tag-danger";
    if (status === "ใกล้หมด") return "tag-warn";
    return "tag-success";
  }

  progressClass(status) {
    if (status === "หมดคลัง") return "danger";
    if (status === "ใกล้หมด") return "warn";
    return "success";
  }
}

export { DomainService };
