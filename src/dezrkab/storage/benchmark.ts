// @ts-nocheck
/**
 * بنچمارک M1 — اندازه‌گیری عملکرد روی داده ترکیبیِ ایزوله
 * =====================================================================
 * این فایل هرگز از باندل محصول import نمی‌شود؛ فقط برای اندازه‌گیری است.
 * داده واقعی فروشگاه دست نمی‌خورد — همه‌چیز روی localStorage جعلی (in-memory) اجرا می‌شود.
 *
 * اجرا:  npx tsx src/storage/benchmark.ts
 *
 * اندازه‌گیری‌ها:
 *   - بارگذاری/استارت‌آپ، جستجوی مشتری، موجودی
 *   - ساخت اجاره (تک و چند دسته‌ای)، برگشت، لغو، پرداخت، تعمیرات، موجودی
 *   - گزارش، خروجی JSON هوش مصنوعی، پشتیبان‌گیری، بازیابی
 *   - تفکیک هزینه mutation: serialize / parse / write
 * در دو مقیاس: ۱٬۰۰۰ و ۵٬۰۰۰ اجاره (≈ ۱۰٬۰۰۰+ قلم)
 */

/* ------------------------- stub ها قبل از import ------------------------- */
type LSStub = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};
const store = new Map<string, string>();
let writeBytes = 0;
const lsStub: LSStub = {
  getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k, v) => {
    writeBytes += v.length;
    store.set(k, v);
  },
  removeItem: (k) => {
    store.delete(k);
  },
};
(globalThis as { localStorage?: LSStub }).localStorage = lsStub;

/* stub حداقلی DOM برای مسیرهای دانلود (پشتیبان اضطراری) */
type StubbedGlobals = {
  Blob?: unknown;
  URL?: unknown;
  document?: unknown;
  window?: unknown;
};
const g = globalThis as unknown as StubbedGlobals;
if (typeof g.Blob === "undefined") {
  g.Blob = class {
    constructor(_parts: unknown[], _opts?: unknown) {}
  };
}
if (typeof g.URL === "undefined") {
  g.URL = { createObjectURL: () => "blob:stub", revokeObjectURL: () => undefined };
}
if (typeof g.document === "undefined") {
  g.document = {
    createElement: () => ({ href: "", download: "", click: () => undefined, remove: () => undefined }),
    body: { appendChild: () => undefined },
  };
}
if (typeof g.window === "undefined") {
  g.window = { setTimeout: (fn: () => void) => globalThis.setTimeout(fn, 0) };
}

/* -------------------------------- ابزار -------------------------------- */
type Row = { op: string; avg: number; worst: number; n: number };
const rows: Row[] = [];

function time(label: string, fn: () => void, repeat = 5): Row {
  const samples: number[] = [];
  for (let i = 0; i < repeat; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  const avg = samples.reduce((s, x) => s + x, 0) / samples.length;
  const worst = Math.max(...samples);
  const row = { op: label, avg, worst, n: repeat };
  rows.push(row);
  return row;
}

function fmtMs(x: number): string {
  return x >= 100 ? `${x.toFixed(0)}ms` : `${x.toFixed(1)}ms`;
}

function statusOf(ms: number): string {
  if (ms < 50) return "excellent";
  if (ms < 100) return "good";
  if (ms < 250) return "acceptable";
  if (ms < 500) return "NEEDS ATTENTION";
  if (ms < 1000) return "PROBLEMATIC";
  return "CRITICAL";
}

/* --------------------------- داده ترکیبی ایزوله --------------------------- */
type DB = import("../domain/models").DB;

function synthesize(db: DB, customers: number, rentals: number, targetBikes: number): DB {
  const rnd = (n: number) => Math.floor(Math.random() * n);
  const cats = db.categories.filter((c) => c.active);
  const hoursOpts = db.settings.durations.map((d) => d.hours);
  const now = Date.now();
  const H = 3_600_000;

  /* دوچرخه‌ها تا سقف هدف */
  while (db.bikes.length < targetBikes) {
    const cat = cats[rnd(cats.length)];
    const serial = `${cat.code}-S${db.bikes.length + 1}`;
    db.bikes.push({
      id: `bk-${db.bikes.length + 1}`,
      serial,
      categoryId: cat.id,
      status: "AVAILABLE",
      rentalId: null,
      maintenanceId: null,
      availableAt: 0,
      note: "",
      createdAt: now - rnd(90) * 24 * H,
    });
  }

  /* مشتریان */
  while (db.customers.length < customers) {
    const i = db.customers.length + 1;
    db.customers.push({
      id: `cus-b${i}`,
      name: `مشتری ترکیبی ${i}`,
      phone: `09${String(10000000 + i).slice(0, 9)}`,
      idNumber: i % 3 === 0 ? `00${String(10000000 + i).slice(0, 8)}` : "",
      note: "",
      completedHours: rnd(6),
      discountUses: [],
      createdAt: now - rnd(120) * 24 * H,
    });
  }

  /* اجاره‌ها با روابط واقعی: قلم‌ها، پرداخت‌ها، رویدادهای audit */
  const statuses = ["COMPLETED", "COMPLETED", "COMPLETED", "SETTLED", "SETTLED", "CANCELLED", "PARTIAL", "ACTIVE"] as const;
  for (let i = 0; i < rentals; i++) {
    const catCount = 1 + rnd(3); // ۱ تا ۳ دسته
    const startAt = now - rnd(60) * 24 * H - rnd(24) * H;
    const hours = hoursOpts[rnd(hoursOpts.length)];
    const items = [] as DB["rentals"][number]["items"];
    const used = new Set<number>();
    for (let k = 0; k < catCount; k++) {
      const ci = rnd(cats.length);
      if (used.has(ci)) continue;
      used.add(ci);
      const c = cats[ci];
      const qty = 1 + rnd(3);
      items.push({ categoryId: c.id, code: c.code, name: c.name, qty, returnedQty: 0, hourlyRate: c.hourlyRate, deposit: 0 });
    }
    const subtotal = items.reduce((s, it) => s + it.hourlyRate * it.qty * hours, 0);
    const discountRate = rnd(10) === 0 ? 30 : 0;
    const discount = Math.round((subtotal * discountRate) / 100);
    const status = statuses[rnd(statuses.length)];
    const late = status === "COMPLETED" && rnd(6) === 0 ? (5 + rnd(40)) * 60_000 : 0;
    const lateFee = late > 0 ? Math.ceil((late - 5 * 60_000) / 60_000) * items.reduce((s, it) => s + it.hourlyRate * it.qty, 0) * 0.0333 * 2 : 0;
    const total = subtotal - discount + Math.round(lateFee);
    const id = `ren-b${i + 1}`;
    const number = 2000 + i;
    db.rentals.push({
      id,
      number,
      customerId: db.customers[rnd(db.customers.length)].id,
      items: items.map((it) => ({ ...it, returnedQty: status === "COMPLETED" || status === "SETTLED" ? it.qty : status === "PARTIAL" ? Math.max(0, it.qty - 1) : 0 })),
      startAt,
      hours,
      plannedEndAt: startAt + hours * H,
      actualEndAt: status === "COMPLETED" || status === "SETTLED" ? startAt + hours * H + late : null,
      subtotal,
      discount,
      discountRate,
      discountAuto: discountRate > 0 && rnd(2) === 0,
      lateFee: Math.round(lateFee),
      depositTotal: 0,
      total,
      status,
      note: "",
      cancelledAt: status === "CANCELLED" ? startAt + H : null,
      cancelReason: status === "CANCELLED" ? "انصراف مشتری" : "",
      createdBy: "usr-bench",
      createdAt: startAt,
    });
    if (status !== "CANCELLED") {
      db.payments.push({
        id: `pay-b${i + 1}`,
        rentalId: id,
        kind: "RENT",
        amount: status === "PARTIAL" || rnd(4) === 0 ? Math.round(total / 2) : total + Math.round(lateFee),
        accountId: db.settings.accounts[rnd(db.settings.accounts.length)].id,
        note: "",
        operatorId: "usr-bench",
        createdAt: startAt + hours * H + late,
      });
    }
    db.audit.push({
      id: `aud-b${i * 2 + 1}`,
      at: startAt,
      actorId: "usr-bench",
      actorName: "بنچمارک",
      action: "ایجاد اجاره",
      entity: "rental",
      entityId: id,
      details: `اجاره #${number} — داده ترکیبی`,
    });
    if (status === "COMPLETED" || status === "SETTLED") {
      db.audit.push({
        id: `aud-b${i * 2 + 2}`,
        at: startAt + hours * H,
        actorId: "usr-bench",
        actorName: "بنچمارک",
        action: "برگشت اجاره",
        entity: "rental",
        entityId: id,
        details: `اجاره #${number} تکمیل شد`,
      });
    }
  }

  /*
    سازگاری ناوگان: اجاره‌های ACTIVE/PARTIAL باید دوچرخه فیزیکی واقعی داشته باشند
    (مثل داده واقعی) تا عملیات برگشت/لغو اندازه‌گیری‌شده معتبر باشد.
    اگر ناوگان کافی نیست، آن اجاره به COMPLETED تبدیل می‌شود.
  */
  for (const b of db.bikes) {
    b.status = "AVAILABLE";
    b.rentalId = null;
    b.maintenanceId = null;
    b.availableAt = 0;
  }
  const free = new Map<string, DB["bikes"]>();
  for (const b of db.bikes) {
    const arr = free.get(b.categoryId);
    if (arr) arr.push(b);
    else free.set(b.categoryId, [b]);
  }
  for (const r of db.rentals) {
    if (r.status !== "ACTIVE" && r.status !== "PARTIAL") continue;
    const taken: DB["bikes"] = [];
    let ok = true;
    for (const it of r.items) {
      const need = it.qty - it.returnedQty;
      const pool = free.get(it.categoryId) ?? [];
      if (pool.length < need) {
        ok = false;
        break;
      }
      taken.push(...pool.splice(pool.length - need, need));
    }
    if (!ok) {
      for (const b of taken) {
        const pool = free.get(b.categoryId);
        if (pool) pool.push(b);
      }
      r.status = "COMPLETED";
      r.actualEndAt = r.plannedEndAt;
      for (const it of r.items) it.returnedQty = it.qty;
      continue;
    }
    for (const b of taken) {
      b.status = "RENTED";
      b.rentalId = r.id;
    }
  }
  db.seq.rental = 2000 + rentals + 1;
  return db;
}

/* --------------------------------- سناریو --------------------------------- */
async function suite(label: string, customers: number, rentals: number, bikes: number): Promise<void> {
  rows.length = 0;
  store.clear();
  writeBytes = 0;

  const storage = await import("./storage");
  const { authService } = await import("../services/authService");

  /* ماژول‌ها بین دو اجرا کش می‌شوند — state را به بذر تازه برگردان و نشست بنچمارک بساز */
  storage.resetToSeed();
  try {
    authService.createFirstManager({ name: "مدیر بنچمارک", username: "bench", password: "bench-pass-1" });
  } catch {
    /* از اجرای قبل موجود است */
  }
  authService.login("bench", "bench-pass-1");
  const { customerService } = await import("../services/customerService");
  const { availabilityService } = await import("../services/availabilityService");
  const { rentalService } = await import("../services/rentalService");
  const { returnService } = await import("../services/returnService");
  const { paymentService } = await import("../services/paymentService");
  const { maintenanceService } = await import("../services/maintenanceService");
  const { inventoryService } = await import("../services/inventoryService");
  const { reportService } = await import("../services/reportService");
  const { buildAIExport } = await import("../services/exportService");
  const { backupService } = await import("../services/backupService");

  /* استارت‌آپ: load + normalize + serialize برای ذخیره اولیه */
  const t0 = performance.now();
  const fresh = synthesize(
    JSON.parse(JSON.stringify(storage.getDB())) as DB,
    customers,
    rentals,
    bikes
  );
  storage.restoreDB(fresh); // مسیر اتمیک بارگذاری/جایگزینی
  const startup = performance.now() - t0;

  const db = storage.getDB();
  const serialized = JSON.stringify(db);
  const sizeKB = Math.round(serialized.length / 1024);
  console.log(`\n===== ${label}: ${rentals} rentals / ${customers} customers / ${db.bikes.length} bikes — DB ≈ ${sizeKB} KB =====`);
  console.log(`startup(load+normalize+persist): ${fmtMs(startup)}`);

  /* هزینه‌های پایه serialization (تفکیک گلوگاه) */
  time("serialize whole DB", () => JSON.stringify(storage.getDB()), 3);
  time("parse whole DB", () => JSON.parse(serialized), 3);
  time("write whole DB (stub)", () => lsStub.setItem("bench", serialized), 3);

  /* جستجوی مشتری */
  time("customer search", () => customerService.search(storage.getDB(), "0910"), 20);

  /* موجودی لحظه‌ای (پیشخوان) */
  time("availability snapshot", () => availabilityService.snapshot(storage.getDB()), 20);

  /* سناریوی صندوق: جستجو → قیمت → ثبت */
  const target = db.customers[0];
  const cats = db.categories.filter((c) => c.active);
  const cashierCreate = () =>
    rentalService.createRental({
      customer: { id: target.id },
      items: [{ categoryId: cats[0].id, qty: 1 }],
      hours: 1,
      startAt: Date.now(),
      note: "",
      discountRate: 0,
      consumeReward: false,
      prepayAmount: 0,
      accountId: db.settings.accounts[0].id,
    });
  time("cashier: create rental (1 cat)", cashierCreate, 10);
  time(
    "create multi-category rental",
    () =>
      rentalService.createRental({
        customer: { id: target.id },
        items: cats.slice(0, 3).map((c) => ({ categoryId: c.id, qty: 1 })),
        hours: 2,
        startAt: Date.now(),
        note: "",
        discountRate: 10,
        consumeReward: false,
        prepayAmount: 0,
        accountId: db.settings.accounts[0].id,
      }),
    5
  );

  /* برگشت: روی آخرین اجاره فعال */
  const active = storage.getDB().rentals.filter((r) => r.status === "ACTIVE");
  if (active.length > 0) {
    const r = active[active.length - 1];
    time(
      "return rental (full)",
      () =>
        returnService.processReturn({
          rentalId: r.id,
          returns: r.items.map((i) => ({ categoryId: i.categoryId, qty: i.qty - i.returnedQty })),
          paymentAmount: 0,
          accountId: db.settings.accounts[0].id,
        }),
      1
    );
  }

  /* پرداخت */
  const due = storage.getDB().rentals.find((r) => r.status === "ACTIVE" || r.status === "PARTIAL" || r.status === "COMPLETED");
  if (due) {
    time(
      "add payment",
      () =>
        paymentService.addPayment({ rentalId: due.id, kind: "RENT", amount: 10_000, accountId: db.settings.accounts[0].id, note: "بنچمارک" }),
      5
    );
  }

  /* تعمیرات */
  const freeBike = storage.getDB().bikes.find((b) => b.status === "AVAILABLE");
  if (freeBike) {
    const rec = maintenanceService.start(freeBike.id, "بنچمارک تعمیر", "");
    time("maintenance finish", () => maintenanceService.finish(rec.id, 100_000), 1);
  }

  /* موجودی انبار */
  time("inventory +1", () => inventoryService.increaseStock(cats[0].id, 1), 3);

  /* گزارش + خروجی‌ها */
  const nowMs = Date.now();
  const range30 = nowMs - 30 * 86_400_000;
  time("report (30 days)", () => reportService.buildAnalytics(storage.getDB(), range30, nowMs), 3);
  time("report (all 60 days)", () => reportService.buildAnalytics(storage.getDB(), nowMs - 60 * 86_400_000, nowMs), 3);
  time("AI JSON build", () => JSON.stringify(buildAIExport(storage.getDB(), range30, nowMs)), 3);

  /* پشتیبان + بازیابی */
  const backupObj = backupService.buildBackup();
  const backupStr = JSON.stringify(backupObj);
  time("backup build+stringify", () => JSON.stringify(backupService.buildBackup()), 3);
  console.log(`backup file ≈ ${Math.round(backupStr.length / 1024)} KB`);
  time("backup validate", () => backupService.validate(JSON.parse(backupStr)), 3);
  time(
    "restore (atomic replace)",
    () => backupService.restore(JSON.parse(backupStr), "benchmark-emergency.json"),
    1
  );

  /* لغو */
  const active2 = storage.getDB().rentals.find((r) => r.status === "ACTIVE");
  if (active2) {
    time("cancel rental", () => rentalService.cancelRental(active2.id, "بنچمارک"), 1);
  }

  /* جدول */
  for (const r of rows) {
    console.log(`${r.op.padEnd(34)} avg ${fmtMs(r.avg).padStart(9)}  worst ${fmtMs(r.worst).padStart(9)}  n=${r.n}  ${statusOf(r.avg)}`);
  }
  console.log(`total bytes written to storage during suite: ${(writeBytes / 1024 / 1024).toFixed(1)} MB`);
}

await suite("SCALE-1k", 500, 1000, 100);
await suite("SCALE-5k", 500, 5000, 100);

console.log("\nبنچمارک پایان یافت — هیچ داده‌ای روی localStorage واقعی نوشته نشد (همه روی stub).");
export {};
