// @ts-nocheck
/**
 * لایه ذخیره‌سازی — قابل تعویض
 * UI → Services → Business Logic → Repository/Storage → Local Persistence
 * امروز: LocalStorageAdapter — فردا: هر بک‌اند واقعی بدون تغییر منطق کسب‌وکار
 *
 * نکته مهم: سه کلید کاملاً مجزا:
 *  - کلید DB: رکوردهای تجاری (هرگز منطق تکراری اینجا نیست، فقط داده)
 *  - کلید Session: نشست ورود
 *  - کلید Prefs: ترجیحات ظاهری UI
 */
import { useSyncExternalStore } from "react";
import type {
  Bike,
  Category,
  Customer,
  DB,
  DiscountUse,
  DurationOption,
  Payment,
  Rental,
  SessionInfo,
  Settings,
} from "../domain/models";
import { hashPassword } from "../utils/hash";

export interface StorageAdapter {
  read(key: string): string | null;
  /** نتیجه صریح موفقیت/شکست — نوشتن هرگز نباید بی‌صدا شکست بخورد */
  write(key: string, value: string): WriteResult;
  remove(key: string): void;
}

export type WriteResult = { ok: true } | { ok: false; error: Error };

/**
 * خطای تایپ‌شده ذخیره‌سازی — وقتی persist ناموفق است mutate پرتاب می‌کند تا:
 * - وضعیت حافظه commit نشود
 * - آخرین وضعیت سالمِ ذخیره‌شده دست‌نخورده بماند
 * - کاربر پیام فارسی واضح ببیند و بتواند دوباره تلاش کند
 */
export class StorageWriteError extends Error {
  readonly isStorageWriteError = true as const;
  readonly causeDetail: unknown;
  constructor(cause?: unknown) {
    super("ذخیره‌سازی ناموفق بود. اطلاعات تغییر نکرد.");
    this.name = "StorageWriteError";
    this.causeDetail = cause;
  }
}

function reportPersistenceFailure(where: string, cause: unknown): void {
  // تشخیص فنی فقط در console — هرگز به‌صورت stack trace به فروشنده نشان داده نمی‌شود
  console.error(`[pedal] persistence failed (${where}) — last-good state preserved.`, cause);
}

const localAdapter: StorageAdapter = {
  read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, value);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

let adapter: StorageAdapter = localAdapter;

/** برای اتصال بک‌اند واقعی در آینده، فقط همین تابع صدا زده می‌شود */
export function setStorageAdapter(next: StorageAdapter): void {
  adapter = next;
}

export const KEYS = {
  db: "pedal.db.v1",
  session: "pedal.session.v1",
  prefs: "pedal.prefs.v1",
  autobackup: "pedal.autobackup.v1",
  lockout: "pedal.lockout.v1",
} as const;

/* ------------------------------ داده اولیه ------------------------------ */

const H = 3_600_000;

function seedDB(): DB {
  const now = Date.now();


  const catDefs: Array<[string, string, number, number, number]> = [
    ["A", "ساده", 50_000, 0, 10],
    ["B", "دنده‌ای", 70_000, 0, 5],
    ["C", "بچه‌گانه", 40_000, 0, 8],
    ["D", "سه‌چرخه", 35_000, 0, 3],
    ["E", "دو نفره", 90_000, 0, 2],
  ];

  const categories: Category[] = catDefs.map(([code, name, rate, dep], i) => ({
    id: `cat-${code}`,
    code,
    name,
    hourlyRate: rate,
    deposit: dep,
    active: true,
    createdAt: now - 90 * 24 * H + i,
  }));

  const bikes: Bike[] = [];
  for (const [code, , , , count] of catDefs) {
    for (let i = 1; i <= count; i++) {
      bikes.push({
        id: `bike-${code}-${i}`,
        serial: `${code}-${String(i).padStart(2, "0")}`,
        categoryId: `cat-${code}`,
        status: "AVAILABLE",
        rentalId: null,
        maintenanceId: null,
        availableAt: 0,
        note: "",
        createdAt: now - 90 * 24 * H,
      });
    }
  }

  /* هیچ داده آزمایشی‌ای ساخته نمی‌شود — فقط دسته‌ها، موجودی و تنظیمات پایه */
  return {
    rev: 1,
    m3Cleaned: true, // نصب تازه، پس از M3 است — نیازی به پاک‌سازی حساب نمایشی ندارد
    demoCleared: true,
    seq: { rental: 1001 },
    /* بدون هیچ حساب پیش‌فرض — مدیر اولیه از «راه‌اندازی اولیه» با رمز انتخابی خود ساخته می‌شود */
    users: [],
    categories,
    bikes,
    customers: [],
    rentals: [],
    payments: [],
    maintenances: [],
    subscriptions: [],
    audit: [],
    settings: makeDefaultSettings(),
  };
}

/** بازه‌های مجاز اجاره — دقیقاً همین فهرست */
const DEFAULT_DURATIONS: DurationOption[] = [
  { hours: 0.5, label: "نیم ساعت" },
  { hours: 1, label: "1 ساعت" },
  { hours: 1.5, label: "1 ساعت و نیم" },
  { hours: 2, label: "2 ساعت" },
  { hours: 3, label: "3 ساعت" },
  { hours: 4, label: "4 ساعت" },
  { hours: 24, label: "1 روزه" },
];

function makeDefaultSettings(): Settings {
  return {
    storeName: "دز رکاب",
    currency: "تومان",
    graceMinutes: 5,
    releaseDelayMinutes: 10,
    lateMultiplier: 2,
    prepMinutes: 3,
    rewardThresholdHours: 4,
    rewardDiscountPercent: 30,
    durations: DEFAULT_DURATIONS.map((d) => ({ ...d })),
    accounts: [
      { id: "acc-pos", name: "مهر ایران", kind: "POS", active: true },
      { id: "acc-cash", name: "نقدی", kind: "CASH", active: true },
      { id: "acc-card", name: "کارت به کارت", kind: "TRANSFER", active: true },
    ],
    receiptTitleMain: "دز رکاب",
    receiptTitleSub: "باشگاه دوچرخه سواری",
    receiptThanks: "از همراهی شما سپاسگزاریم 🌱",
    receiptPhone: "09166353848",
    receiptLateRule:
      "در صورت دیرکرد پس از ساعت برگشت، هزینه هر دقیقه دیرکرد با ۲ برابر نرخ معمول هر دقیقه محاسبه می‌شود.",
  };
}

/**
 * مهاجرت داده‌های ذخیره‌شده نسخه‌های قبل —
 * فیلدهای جدید با مقدار پیش‌فرض پر می‌شوند تا داده قدیمی هم سالم بماند
 */
function normalizeDB(p: DB): DB {
  const customers: Customer[] = (p.customers ?? []).map((c) => ({
    ...c,
    completedHours: typeof c.completedHours === "number" ? c.completedHours : 0,
    discountUses: Array.isArray(c.discountUses) ? c.discountUses : ([] as DiscountUse[]),
  }));
  const rentals: Rental[] = (p.rentals ?? []).map((r) => ({
    ...r,
    discountRate: typeof r.discountRate === "number" ? r.discountRate : 0,
    discountAuto: r.discountAuto === true,
  }));
  const defaults = makeDefaultSettings();
  const settings: Settings = {
    ...defaults,
    ...p.settings,
    durations: DEFAULT_DURATIONS.map((d) => ({ ...d })),
    accounts:
      p.settings && Array.isArray(p.settings.accounts) && p.settings.accounts.length > 0
        ? p.settings.accounts
        : defaults.accounts,
  };
  settings.prepMinutes = Math.min(5, Math.max(0, settings.prepMinutes ?? 3));
  /* مهاجرت: حد نصاب پاداش از ۵ ساعت به ۴ ساعت تغییر کرد (مقدار سفارشی مدیر حفظ می‌شود) */
  if (settings.rewardThresholdHours === 5) settings.rewardThresholdHours = 4;
  /* مهاجرت: مهلت بخشودگی ۵ دقیقه و ضریب جریمه ۲ (فقط مقادیر پیش‌فرض قدیمی جایگزین می‌شوند) */
  if (settings.graceMinutes === 15) settings.graceMinutes = 5;
  if (settings.lateMultiplier === 1.5) settings.lateMultiplier = 2;
  /* مهاجرت: نام فروشگاه به «دز رکاب» (نام سفارشی مدیر حفظ می‌شود) */
  if (settings.storeName === "دوچرخه‌سرای پدال") settings.storeName = "دز رکاب";
  /* مهاجرت: شماره تماس پیش‌فرض رسید */
  if (settings.receiptPhone === "09122345544") settings.receiptPhone = "09166353848";
  /* مهاجرت نام حساب‌های پیش‌فرض */
  for (const acc of settings.accounts) {
    if (acc.name === "دستگاه کارت‌خوان") acc.name = "مهر ایران";
    if (acc.name === "صندوق نقدی") acc.name = "نقدی";
  }

  /*
    مهاجرت امنیتی M3 — فقط یک‌بار برای هر پایگاه داده:
    حساب‌های نمایشیِ قدیمی (manager/1234 و seller/1234) صرفاً در داده‌های پیش از M3 حذف می‌شوند.
    نشانِ m3Cleaned تضمین می‌کند این فیلتر در بارگذاری‌های بعدی هرگز تکرار نشود —
    وگرنه حسابی که کاربر در راه‌اندازی اولیه با همین ترکیب ساخته بود، بعد از هر reload حذف می‌شد.
  */
  let users = p.users ?? [];
  if (p.m3Cleaned !== true) {
    const demoHash = hashPassword("1234");
    users = users.filter(
      (u) =>
        !(u.passHash === demoHash && (u.username === "manager" || u.username === "seller"))
    );
  }
  let subscriptions = Array.isArray((p as any).subscriptions) ? (p as any).subscriptions : [];
  const clean = { ...p } as any;
  delete clean.expenses;

  /*
    پاک‌سازی یک‌باره داده‌های آزمایشی — آماده‌سازی برای شروع اجاره‌های واقعی.
    اطلاعات پایه (دسته‌ها، نرخ‌ها، دوچرخه‌ها، حساب‌ها، تنظیمات و کاربران) دست‌نخورده می‌ماند؛
    فقط مشتری‌ها، اجاره‌ها، پرداخت‌ها، تعمیرات، اشتراک‌ها و تاریخچه نمایشی حذف می‌شوند.
  */
  let outCustomers = customers;
  let outRentals = rentals;
  let payments = (p as any).payments ?? [];
  let maintenances = (p as any).maintenances ?? [];
  let audit = (p as any).audit ?? [];
  let bikes = (p as any).bikes ?? [];
  let seq = (p as any).seq ?? { rental: 1001 };
  if ((p as any).demoCleared !== true) {
    outCustomers = [];
    outRentals = [];
    payments = [];
    maintenances = [];
    subscriptions = [];
    audit = [];
    bikes = bikes.map((b: any) => ({
      ...b,
      status: "AVAILABLE",
      note: "",
      rentalId: null,
      maintenanceId: null,
      availableAt: 0,
    }));
    seq = { rental: 1001 };
  }

  return {
    ...clean,
    m3Cleaned: true,
    demoCleared: true,
    users,
    bikes,
    seq,
    customers: outCustomers,
    rentals: outRentals,
    payments,
    maintenances,
    audit,
    subscriptions,
    settings,
  };
}

/* --------------------------- store با snapshot --------------------------- */

function loadDB(): DB {
  const raw = adapter.read(KEYS.db);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && typeof parsed.rev === "number" && Array.isArray(parsed.rentals)) {
        return normalizeDB(parsed);
      }
    } catch {
      /* داده خراب — بازسازی */
    }
  }
  const fresh = seedDB();
  const write = adapter.write(KEYS.db, JSON.stringify(fresh));
  if (!write.ok) {
    // هنوز داده تجاری‌ای وجود ندارد — فقط ثبت تشخیصی؛ سامانه در حافظه کار می‌کند
    reportPersistenceFailure("write-initial-seed", write.error);
  }
  return fresh;
}

/*
  مقداردهی تنبل (lazy):
  اجرای seed/Math.random در سطح ماژول روی رانتایم سرور (Cloudflare Worker) ممنوع است
  و باعث خطای ۵۰۰ در نسخه منتشرشده می‌شود. پس اولین دسترسی، state را می‌سازد.
*/
let state: DB | null = null;
const listeners = new Set<() => void>();

export function getDB(): DB {
  if (state === null) state = loadDB();
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * تنها درگاه تغییر داده — اتمیک و امن در برابر شکست ذخیره‌سازی.
 * ترتیب: آماده‌سازی → اعتبارسنجی → serialize → persist → commit حافظه → notify
 * اگر persist شکست بخورد، state دست‌نخورده می‌ماند و StorageWriteError پرتاب می‌شود؛
 * هرگز «حافظه=جدید / ذخیره=قدیم» بدون هشدار رخ نمی‌دهد و آخرین وضعیت سالم باقی می‌ماند.
 */
export function mutate<T>(fn: (draft: DB) => T): T {
  const current = getDB();
  const draft: DB = JSON.parse(JSON.stringify(current)) as DB;
  const result = fn(draft); // آماده‌سازی + اعتبارسنجی — پرتاب ⇒ state دست‌نخورده
  draft.rev = current.rev + 1;

  let serialized: string;
  try {
    serialized = JSON.stringify(draft);
  } catch (cause) {
    reportPersistenceFailure("serialize", cause);
    throw new StorageWriteError(cause);
  }

  const write = adapter.write(KEYS.db, serialized);
  if (!write.ok) {
    reportPersistenceFailure("write", write.error);
    throw new StorageWriteError(write.error); // commit انجام نشد — state و storage هر دو قدیمی/سالم
  }

  state = draft;
  listeners.forEach((l) => l());
  return result;
}

export function resetToSeed(): void {
  const fresh = seedDB();
  let serialized: string;
  try {
    serialized = JSON.stringify(fresh);
  } catch (cause) {
    reportPersistenceFailure("serialize-seed", cause);
    throw new StorageWriteError(cause);
  }
  const write = adapter.write(KEYS.db, serialized);
  if (!write.ok) {
    reportPersistenceFailure("write-seed", write.error);
    throw new StorageWriteError(write.error);
  }
  state = fresh;
  listeners.forEach((l) => l());
}

/**
 * بازیابی کامل — فقط به‌صورت اتمیک:
 * یا کل وضعیت جایگزین می‌شود یا هیچ‌چیز تغییر نمی‌کند.
 * ابتدا persist موفق، سپس commit حافظه — بازیابی ناموفق state فعلی را دست نمی‌زند.
 * داده‌های نسخه‌های قدیمی‌تر هم هنگام ورود نرمال‌سازی می‌شوند.
 */
export function restoreDB(next: DB): void {
  const normalized = normalizeDB({ ...next, rev: getDB().rev + 1 });
  let serialized: string;
  try {
    serialized = JSON.stringify(normalized);
  } catch (cause) {
    reportPersistenceFailure("serialize-restore", cause);
    throw new StorageWriteError(cause);
  }
  const write = adapter.write(KEYS.db, serialized);
  if (!write.ok) {
    reportPersistenceFailure("write-restore", write.error);
    throw new StorageWriteError(write.error); // state فعلی کاملاً دست‌نخورده ماند
  }
  state = normalized;
  listeners.forEach((l) => l());
}

/** اسنپ‌شات خودکار روزانه (سبک و محلی) */
export const snapshotStore = {
  read(): string | null {
    return adapter.read(KEYS.autobackup);
  },
  write(value: string): void {
    adapter.write(KEYS.autobackup, value);
  },
};

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, getDB);
}

/* ------------------------- نشست (جدا از داده تجاری) ------------------------ */

export const sessionStore = {
  read(): SessionInfo | null {
    const raw = adapter.read(KEYS.session);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw) as SessionInfo;
      return s && s.userId ? s : null;
    } catch {
      return null;
    }
  },
  /** نتیجه واقعی persist — نشستِ ذخیره‌نشده نباید «موفق» تلقی شود */
  write(s: SessionInfo): boolean {
    return adapter.write(KEYS.session, JSON.stringify(s)).ok;
  },
  clear(): void {
    adapter.remove(KEYS.session);
  },
};

/* ------------------- محدودیت تلاش ورود (جدا از داده تجاری) ------------------- */

export interface LockoutEntry {
  count: number;
  lockedUntil: number;
}

export const lockoutStore = {
  read(): Record<string, LockoutEntry> {
    const raw = adapter.read(KEYS.lockout);
    if (!raw) return {};
    try {
      const p = JSON.parse(raw) as Record<string, LockoutEntry>;
      return p && typeof p === "object" && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  },
  write(map: Record<string, LockoutEntry>): void {
    adapter.write(KEYS.lockout, JSON.stringify(map));
  },
};

/* ---------------------- ترجیحات UI (جدا از داده تجاری) --------------------- */

export const prefsStore = {
  read<T>(key: string, fallback: T): T {
    const raw = adapter.read(`${KEYS.prefs}.${key}`);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown): void {
    adapter.write(`${KEYS.prefs}.${key}`, JSON.stringify(value));
  },
};
