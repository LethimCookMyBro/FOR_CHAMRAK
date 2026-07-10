const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const repoRoot = path.resolve(__dirname, "..");

async function loadDomainService() {
  const modulePath = pathToFileURL(path.join(repoRoot, "web", "js", "domain-service.js")).href;
  const module = await import(`${modulePath}?t=${Date.now()}`);
  return module.DomainService;
}

test("visit workflow is exposed as a local table-backed screen", async () => {
  const [index, app, actions, dialogs] = await Promise.all([
    fs.readFile(path.join(repoRoot, "index.html"), "utf8"),
    fs.readFile(path.join(repoRoot, "web", "js", "ltc-app.js"), "utf8"),
    fs.readFile(path.join(repoRoot, "web", "js", "ltc-app-action-methods.js"), "utf8"),
    fs.readFile(path.join(repoRoot, "web", "js", "entity-dialog-service.js"), "utf8")
  ]);

  await fs.access(path.join(repoRoot, "chamrak_export", "data", "t27_visits.json"));
  assert.match(index, /data-page="visits"/);
  assert.match(index, /id="visitAddBtn"/);
  assert.match(index, /id="visitMonthFromFilter"/);
  assert.match(index, /id="visitPersonMonthRows"/);
  assert.match(app, /visits:\s*""/);
  assert.match(app, /visitMonthFrom:\s*""/);
  assert.match(app, /bindSelectableTable\(this\.el\.visitBody,\s*"visits"/);
  assert.match(actions, /handleAddVisit/);
  assert.match(actions, /visitorName/);
  assert.match(actions, /handleDeleteVisit/);
  assert.match(dialogs, /openVisitDialog/);
  assert.match(dialogs, /visitorName/);
});

test("visit coverage counts only completed visits in the care plan window", async () => {
  const DomainService = await loadDomainService();
  const domain = new DomainService({});
  const dependent = {
    ID: 7,
    TAI: "I2",
    "วันเริ่ม cp": "2026-01-01T00:00:00",
    "วันสิ้นสุด cp": "2026-12-31T00:00:00",
    visitsPerYear: 4
  };
  const visits = [
    { beneficiaryId: 7, visitDate: "2026-02-01T00:00:00", status: "completed" },
    { beneficiaryId: 7, visitDate: "2026-03-01T00:00:00", status: "postponed" },
    { beneficiaryId: 7, visitDate: "2025-12-31T00:00:00", status: "completed" }
  ];

  const [coverage] = domain.buildVisitCoverage([dependent], visits, [], { today: "2026-06-28" });

  assert.equal(coverage.targetVisits, 4);
  assert.equal(coverage.completedVisits, 1);
  assert.equal(coverage.remainingVisits, 3);
  assert.equal(coverage.coveragePercent, 25);
  assert.equal(coverage.statusKey, "under");
});

test("deceased beneficiaries are separated from active LTC beneficiaries", async () => {
  const DomainService = await loadDomainService();
  const domain = new DomainService({});
  const rows = [
    { ID: 1, "สถานะ": false, "วันที่เสียชีวิต": null },
    { ID: 2, "สถานะ": true, "วันที่เสียชีวิต": "2026-07-10" }
  ];

  assert.deepEqual(domain.activeDependents(rows).map((row) => row.ID), [1]);
  assert.deepEqual(domain.deceasedDependents(rows).map((row) => row.ID), [2]);
});

test("dependent screen omits visit metrics and exposes the deceased workflow", async () => {
  const [index, app, actions, dialogs, renderer] = await Promise.all([
    fs.readFile(path.join(repoRoot, "index.html"), "utf8"),
    fs.readFile(path.join(repoRoot, "web", "js", "ltc-app.js"), "utf8"),
    fs.readFile(path.join(repoRoot, "web", "js", "ltc-app-action-methods.js"), "utf8"),
    fs.readFile(path.join(repoRoot, "web", "js", "entity-dialog-service.js"), "utf8"),
    fs.readFile(path.join(repoRoot, "web", "js", "ltc-app-render-methods.js"), "utf8")
  ]);

  assert.match(index, /data-page="deceased"/);
  assert.match(index, /id="deceasedBody"/);
  assert.match(index, /id="dependentsMarkDeceasedBtn"/);
  const dependentsPage = index.match(/<section id="page-dependents"[\s\S]*?<\/section>/)?.[0] || "";
  assert.doesNotMatch(dependentsPage, /<th>ความครอบคลุม<\/th>/);
  assert.doesNotMatch(dependentsPage, /<th>คงเหลือ<\/th>/);
  assert.match(app, /deceased:\s*null/);
  assert.match(actions, /handleMarkDependentDeceased/);
  assert.match(actions, /handleRestoreDeceasedDependent/);
  assert.match(dialogs, /openDeathDialog/);
  assert.match(dialogs, /label: "กลุ่ม 1"/);
  assert.doesNotMatch(dialogs, /label: "กลุ่ม 1 \(I1\)"/);
  assert.match(dialogs, /name: "prefix",[\s\S]*?options: \["นาย", "นาง", "นางสาว", "ด\.ช\.", "ด\.ญ\."\],\r?\n\s*wide: true/);
  assert.ok(dialogs.indexOf('name: "address"') < dialogs.indexOf('name: "subdistrict"'));
  assert.match(dialogs, /control\.id = `entity-field-\$\{field\.name\}`/);
  assert.match(dialogs, /label\.htmlFor = control\.id/);
  assert.match(renderer, /activeDependents\(rows\)/);
  assert.match(renderer, /deceasedDependents\(/);
});

test("domain summaries cover ADL warnings, care plan alerts, workload, and area reports", async () => {
  const DomainService = await loadDomainService();
  const domain = new DomainService({});
  const dependents = [
    {
      ID: 1,
      TAI: "I1",
      ADL: 18,
      "ตำบล": "A",
      "หมู่": "1",
      "รหัสcg": "CG1",
      "รหัสcm": "CM1",
      "วันสิ้นสุด cp": "2026-06-01T00:00:00",
      visitsPerYear: 2
    },
    {
      ID: 2,
      TAI: "C3",
      ADL: 3,
      "ตำบล": "A",
      "หมู่": "2",
      "รหัสcg": "CG1",
      "รหัสcm": "CM1",
      "วันสิ้นสุด cp": "2026-07-20T00:00:00",
      visitsPerYear: 2
    },
    {
      ID: 3,
      TAI: "I2",
      ADL: 8,
      "ตำบล": "B",
      "หมู่": "1",
      "รหัสcg": "CG2",
      "รหัสcm": "CM2",
      visitsPerYear: 0
    }
  ];
  const visits = [
    { beneficiaryId: 1, responsibleCgId: "CG1", responsibleCmId: "CM1", visitDate: "2026-02-01", status: "completed" },
    { beneficiaryId: 2, responsibleCgId: "CG1", responsibleCmId: "CM1", visitDate: "2026-02-01", status: "cancelled" }
  ];

  assert.equal(domain.getTaiConsistency(3, "I1").consistent, false);
  assert.equal(domain.getTaiConsistency(18, "I1").consistent, true);

  const alerts = domain.summarizeCarePlanAlerts(dependents, { today: "2026-06-28" });
  assert.equal(alerts.expired.length, 1);
  assert.equal(alerts.expiring.length, 1);
  assert.equal(alerts.missingEnd.length, 1);

  const workloads = domain.summarizeStaffWorkloads(dependents, visits, [], { today: "2026-06-28" });
  assert.equal(workloads.cg.find((row) => row.staffId === "CG1").assignedBeneficiaries, 2);
  assert.equal(workloads.cg.find((row) => row.staffId === "CG1").completedVisits, 1);

  const reports = domain.summarizeAreaReports(dependents, visits, [], { today: "2026-06-28" });
  assert.equal(reports.bySubdistrict.find((row) => row.key === "A").count, 2);
  assert.equal(reports.byDependency.find((row) => row.key === "C3").count, 1);
});

test("visit month summary lists completed visit dates per beneficiary", async () => {
  const DomainService = await loadDomainService();
  const domain = new DomainService({});
  const visits = [
    { beneficiaryId: 1, beneficiaryName: "A", visitDate: "2026-02-01", status: "completed" },
    { beneficiaryId: 1, beneficiaryName: "A", visitDate: "2026-03-05", status: "completed" },
    { beneficiaryId: 1, beneficiaryName: "A", visitDate: "2026-04-01", status: "completed" },
    { beneficiaryId: 2, beneficiaryName: "B", visitDate: "2026-03-10", status: "cancelled" }
  ];

  const [summary] = domain.buildVisitMonthSummary(visits, { fromMonth: "2026-02", toMonth: "2026-03" });

  assert.equal(summary.beneficiaryName, "A");
  assert.equal(summary.count, 2);
  assert.deepEqual(summary.dates, ["2026-02-01", "2026-03-05"]);
});

test("finance summary includes all five income and expense categories", async () => {
  const DomainService = await loadDomainService();
  const domain = new DomainService({});

  const summary = domain.summarizeFinance([
    { "รายรับ5": 100, "รายจ่าย5": 40 },
    { "รายรับ1": 20, "รายจ่าย2": 5 }
  ]);

  assert.equal(summary.income.length, 5);
  assert.equal(summary.expense.length, 5);
  assert.equal(summary.income[4], 100);
  assert.equal(summary.expense[4], 40);
  assert.equal(summary.totalIncome, 120);
  assert.equal(summary.totalExpense, 45);
  assert.equal(summary.net, 75);
});

test("finance rows mark the current category schema and flag ambiguous legacy rows", async () => {
  const DomainService = await loadDomainService();
  const domain = new DomainService({});

  const current = domain.buildFinanceRow(
    { type: "expense", category: "2", amount: 50, date: "2026-07-01", year: 2569, note: "cg" },
    {},
    1
  );

  assert.equal(current.financeCategorySchemaVersion, 2);
  assert.equal(current.financeCategoryType, "expense");
  assert.equal(current.financeCategory, "2");
  assert.equal(domain.parseFinanceRow(current).legacyNeedsReview, false);

  const legacyExpense = domain.parseFinanceRow({ "รายจ่าย2": 50 });
  assert.equal(legacyExpense.type, "expense");
  assert.equal(legacyExpense.category, "2");
  assert.equal(legacyExpense.legacyNeedsReview, true);

  assert.throws(
    () => domain.buildFinanceRow({ type: "expense", category: "9", amount: 50, date: "2026-07-01", year: 2569 }, {}, 1),
    /หมวดรายรับ\/รายจ่ายไม่ถูกต้อง/
  );
});
