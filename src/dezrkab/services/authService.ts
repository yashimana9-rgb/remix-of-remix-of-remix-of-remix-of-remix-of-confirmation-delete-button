// @ts-nocheck
/** احراز هویت داخلی + دسترسی‌ها — نشست پایدار، بدون رمز خام در state */
import type { DB, Role, SessionInfo, User } from "../domain/models";
import { getDB, lockoutStore, mutate, sessionStore, StorageWriteError } from "../storage/storage";
import { faNum } from "../utils/format";
import { hashPassword, verifyPassword } from "../utils/hash";
import { auditService } from "./auditService";

/* ---------------- سیاست‌های نشست و ورود — فقط از همین‌جا پیکربندی می‌شود ---------------- */

/** عمر مطلق نشست: ۱۲ ساعت پس از ورود — باز بودن مرورگر تمدیدش نمی‌کند */
export const SESSION_LIFETIME_MS = 12 * 3_600_000;
/** حداکثر تلاش ناموفق پیاپی پیش از قفل */
export const MAX_FAILED_ATTEMPTS = 5;
/** مدت قفل ورود پس از عبور از حد مجاز */
export const LOCKOUT_DURATION_MS = 15 * 60_000;

/**
 * تشخیص‌های توسعه — فقط واقعیت‌های امن (پیدا شدن کاربر، فعال بودن، نتیجه راستی‌آزمایی،
 * ایجاد/ذخیره نشست). هرگز رمز یا هش رمز را ثبت نمی‌کند و در build محصول خاموش است.
 */
function authDiag(event: string, facts: Record<string, boolean | number | string>): void {
  const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  if (env?.DEV) console.info(`[auth] ${event}`, facts);
}

/** اطلاع «نشست منقضی شد» برای نمایش یک‌باره در صفحه ورود */
let expiredNotice = false;

export type Perm =
  | "rental.create"
  | "return.process"
  | "payment.receive"
  | "payment.correct"
  | "customer.manage"
  | "inventory.manage"
  | "maintenance.manage"
  | "subscription.manage"
  | "reports.view"
  | "settings.manage"
  | "users.manage"
  | "bikes.service";

const MANAGER_PERMS: Perm[] = [
  "rental.create",
  "return.process",
  "payment.receive",
  "payment.correct",
  "customer.manage",
  "inventory.manage",
  "maintenance.manage",
  "subscription.manage",
  "reports.view",
  "settings.manage",
  "users.manage",
  "bikes.service",
];

/**
 * فروشنده — دست باز در عملیات روزانه:
 * اجاره، برگشت، دریافت وجه، مشتری، تعمیرات، خروج/برگشت دوچرخه و اشتراک ویژه.
 * موارد حساس (تنظیمات، کاربران، آمار و خروجی‌ها، اصلاح سند) فقط مدیر.
 */
const SELLER_PERMS: Perm[] = [
  "rental.create",
  "return.process",
  "payment.receive",
  "customer.manage",
  "maintenance.manage",
  "subscription.manage",
  "bikes.service",
];

const GRANTS: Record<Role, Perm[]> = {
  MANAGER: MANAGER_PERMS,
  SELLER: SELLER_PERMS,
};

/** برچسب فارسی نقش‌ها — MANAGER = پشتیبان (دسترسی کامل)، SELLER = مدیر (عملیات روزانه) */
export const ROLE_LABEL: Record<Role, string> = {
  MANAGER: "پشتیبان",
  SELLER: "مدیر",
};

export function roleLabel(role: Role): string {
  return ROLE_LABEL[role] ?? role;
}

export function can(user: User | null, perm: Perm): boolean {
  return !!user && GRANTS[user.role].includes(perm);
}

export function requirePerm(user: User | null, perm: Perm): void {
  if (!can(user, perm)) {
    throw new Error("دسترسی کافی برای این عملیات ندارید");
  }
}

export const authService = {
  login(username: string, password: string): User {
    const u = (username || "").trim().toLowerCase();
    const now = Date.now();

    /* ---------- قفل تلاش‌های ناموفق — پیش از هر بررسی رمز ---------- */
    const map = lockoutStore.read();
    const entry = map[u];
    if (entry && entry.lockedUntil > now) {
      const mins = Math.ceil((entry.lockedUntil - now) / 60_000);
      authDiag("login-blocked", { locked: true, remainingMin: mins });
      throw new Error(
        `تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ${faNum(mins)} دقیقه دیگر دوباره تلاش کنید.`
      );
    }

    /* ---------- یافتن کاربر و راستی‌آزمایی رمز ---------- */
    const user = getDB().users.find(
      (x) => x.username.toLowerCase() === u && x.active
    );
    const verifyOk = !!user && verifyPassword(password, user.passHash);
    authDiag("login-attempt", {
      userFound: !!user,
      userActive: !!user && user.active,
      verifyOk,
    });

    if (!user || !verifyOk) {
      /* پیام یکسان برای کاربر ناموجود و رمز نادرست — افشای وجود حساب ممنوع */
      const count = (entry?.count ?? 0) + 1;
      if (count >= MAX_FAILED_ATTEMPTS) {
        map[u] = { count: 0, lockedUntil: Date.now() + LOCKOUT_DURATION_MS };
        lockoutStore.write(map);
        authDiag("lockout-set", { attempts: count });
        throw new Error(
          "تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ۱۵ دقیقه دیگر دوباره تلاش کنید."
        );
      }
      map[u] = { count, lockedUntil: 0 };
      lockoutStore.write(map);
      throw new Error("نام کاربری یا رمز عبور نادرست است");
    }

    /* ---------- موفق: پاک‌سازی قفل + ایجاد نشست پایدار و تأییدشده ---------- */
    if (entry) {
      delete map[u];
      lockoutStore.write(map);
      authDiag("lockout-cleared", { reason: "success" });
    }
    const session: SessionInfo = {
      userId: user.id,
      loginAt: now,
      lastValidatedAt: now,
    };
    const persisted = sessionStore.write(session);
    authDiag("session", { created: true, persisted });
    if (!persisted) {
      throw new Error("ورود انجام نشد — ذخیره‌سازی نشست در مرورگر ممکن نیست");
    }
    if (sessionStore.read()?.userId !== user.id) {
      throw new Error("ورود انجام نشد — نشست ذخیره‌شده قابل خواندن نیست");
    }

    /*
      ثبت رویداد ورود — بهترین تلاش.
      شکست persist نباید کاربر تازه‌احراز‌هویت‌شده را پشت در نگه دارد؛
      نشستِ تأییدشده همین حالا پایدار شده است.
    */
    const actorId = user.id;
    try {
      mutate((draft) => {
        draft.__actor = actorId;
        auditService.log(draft, "ورود به سامانه", "auth", user.id, `${user.name} وارد شد`);
        delete draft.__actor;
      });
    } catch (e) {
      if (e instanceof StorageWriteError) {
        authDiag("audit-skipped", { reason: "persist-failed" });
      } else {
        throw e;
      }
    }
    return user;
  },

  logout(): void {
    sessionStore.clear();
  },

  /**
   * اعتبارسنجی متمرکز نشست — تنها مرجع تصمیم «کاربر وارد است یا نه».
   * انقضای مطلق ۱۲ ساعته، وجود کاربر و فعال‌بودن او بررسی می‌شود؛
   * نشستِ باطل همان لحظه پاک می‌شود.
   */
  validateSession(): User | null {
    const s = sessionStore.read();
    if (!s) return null;
    const now = Date.now();
    if (now - s.loginAt > SESSION_LIFETIME_MS) {
      sessionStore.clear();
      expiredNotice = true;
      authDiag("session-expired", { ageMin: Math.round((now - s.loginAt) / 60_000) });
      return null;
    }
    const user = getDB().users.find((x) => x.id === s.userId && x.active);
    if (!user) {
      sessionStore.clear();
      authDiag("session-invalidated", { reason: "user-missing-or-inactive" });
      return null;
    }
    if (!s.lastValidatedAt || now - s.lastValidatedAt > 60_000) {
      sessionStore.write({ ...s, lastValidatedAt: now }); // بهترین تلاش؛ عمر نشست تغییر نمی‌کند
    }
    return user;
  },

  hasSession(): boolean {
    return sessionStore.read() !== null;
  },

  /** اطلاع انقضای نشست — یک‌بار مصرف برای صفحه ورود */
  takeExpiredNotice(): boolean {
    const v = expiredNotice;
    expiredNotice = false;
    return v;
  },

  /** اگر نشست به کاربر غیرفعال/حذف‌شده اشاره کند یا منقضی شده باشد، غیرمعتبر است */
  currentUser(): User | null {
    return this.validateSession();
  },

  requireUser(): User {
    const u = this.currentUser();
    if (!u) throw new Error("ابتدا وارد سامانه شوید");
    return u;
  },

  /**
   * راه‌اندازی اولیه — فقط وقتی هیچ حساب مدیرِ فعالی وجود ندارد.
   * بعد از ساخت اولین مدیر، این مسیر برای همیشه بسته می‌شود.
   */
  needsSetup(): boolean {
    return !getDB().users.some((u) => u.role === "MANAGER" && u.active);
  },

  /** ساخت اولین حساب مدیر با رمز انتخابی کاربر — هیچ رمز پیش‌فرضی وجود ندارد */
  createFirstManager(input: { name: string; username: string; password: string }): User {
    const name = input.name.trim().replace(/\s+/g, " ");
    const username = input.username.trim().toLowerCase();
    if (!name) throw new Error("نام و نام خانوادگی پشتیبان را وارد کنید");
    if (!username) throw new Error("نام کاربری را وارد کنید");
    if (input.password.length < 4) throw new Error("رمز عبور باید حداقل ۴ کاراکتر باشد");
    return mutate((draft) => {
      // نگهبان سمت سرویس: حتی اگر UI قدیمی باشد، تکرار راه‌اندازی ممکن نیست
      if (draft.users.some((u) => u.role === "MANAGER" && u.active)) {
        throw new Error("حساب پشتیبان قبلاً ساخته شده — راه‌اندازی اولیه فقط یک‌بار است");
      }
      if (draft.users.some((u) => u.username.toLowerCase() === username)) {
        throw new Error("این نام کاربری قبلاً ثبت شده است");
      }
      const user: User = {
        id: `usr-${Date.now().toString(36)}`,
        name,
        username,
        passHash: hashPassword(input.password),
        role: "MANAGER",
        active: true,
        createdAt: Date.now(),
      };
      draft.users.push(user);
      draft.__actor = user.id;
      auditService.log(draft, "ایجاد حساب پشتیبان اولیه", "user", user.id, `${name} — ${username}`);
      delete draft.__actor;
      return user;
    });
  },

  actorId(): string {
    return this.currentUser()?.id ?? "system";
  },

  withActor<T>(draft: DB, fn: (draft: DB) => T): T {
    draft.__actor = this.actorId();
    try {
      return fn(draft);
    } finally {
      delete draft.__actor;
    }
  },

  addUser(input: {
    name: string;
    username: string;
    password: string;
    role: Role;
  }): User {
    const me = this.requireUser();
    requirePerm(me, "users.manage");
    const name = input.name.trim();
    const username = input.username.trim().toLowerCase();
    if (!name || !username) throw new Error("نام و نام کاربری الزامی است");
    if (input.password.length < 4) throw new Error("رمز عبور حداقل ۴ کاراکتر باشد");
    return mutate((draft) => {
      if (draft.users.some((u) => u.username.toLowerCase() === username)) {
        throw new Error("این نام کاربری قبلاً ثبت شده است");
      }
      const user: User = {
        id: `usr-${Date.now().toString(36)}`,
        name,
        username,
        passHash: hashPassword(input.password),
        role: input.role,
        active: true,
        createdAt: Date.now(),
      };
      draft.users.push(user);
      this.withActor(draft, (d) =>
        auditService.log(d, "افزودن کاربر", "user", user.id, `${name} — ${roleLabel(input.role)}`)
      );
      return user;
    });
  },

  /** ویرایش اطلاعات کاربر — نام، نام کاربری و نقش */
  updateUser(userId: string, input: { name: string; username: string; role: Role }): void {
    const me = this.requireUser();
    requirePerm(me, "users.manage");
    const name = input.name.trim().replace(/\s+/g, " ");
    const username = input.username.trim().toLowerCase();
    if (!name) throw new Error("نام و نام خانوادگی الزامی است");
    if (!username) throw new Error("نام کاربری الزامی است");
    mutate((draft) => {
      const target = draft.users.find((u) => u.id === userId);
      if (!target) throw new Error("کاربر پیدا نشد");
      if (draft.users.some((u) => u.id !== userId && u.username.toLowerCase() === username)) {
        throw new Error("این نام کاربری قبلاً ثبت شده است");
      }
      if (target.role === "MANAGER" && input.role !== "MANAGER") {
        const activeManagers = draft.users.filter(
          (u) => u.role === "MANAGER" && u.active && u.id !== userId
        ).length;
        if (activeManagers < 1) {
          throw new Error("حداقل یک پشتیبان فعال باید وجود داشته باشد");
        }
      }
      const before = `${target.name} — @${target.username} — ${roleLabel(target.role)}`;
      target.name = name;
      target.username = username;
      target.role = input.role;
      this.withActor(draft, (d) =>
        auditService.log(
          d,
          "ویرایش کاربر",
          "user",
          userId,
          `${before} ← ${name} — @${username} — ${roleLabel(input.role)}`
        )
      );
    });
  },

  setUserActive(userId: string, active: boolean): void {
    const me = this.requireUser();
    requirePerm(me, "users.manage");
    mutate((draft) => {
      const target = draft.users.find((u) => u.id === userId);
      if (!target) throw new Error("کاربر پیدا نشد");
      if (target.role === "MANAGER") {
        const activeManagers = draft.users.filter(
          (u) => u.role === "MANAGER" && u.active
        ).length;
        if (!active && activeManagers <= 1) {
          throw new Error("حداقل یک پشتیبان فعال باید وجود داشته باشد");
        }
      }
      if (target.id === me.id && !active) {
        throw new Error("نمی‌توانید حساب خود را غیرفعال کنید");
      }
      target.active = active;
      this.withActor(draft, (d) =>
        auditService.log(d, active ? "فعال‌سازی کاربر" : "غیرفعال‌سازی کاربر", "user", userId, target.name)
      );
    });
  },

  resetPassword(userId: string, newPassword: string): void {
    const me = this.requireUser();
    requirePerm(me, "users.manage");
    if (newPassword.length < 4) throw new Error("رمز عبور حداقل ۴ کاراکتر باشد");
    mutate((draft) => {
      const target = draft.users.find((u) => u.id === userId);
      if (!target) throw new Error("کاربر پیدا نشد");
      target.passHash = hashPassword(newPassword);
      this.withActor(draft, (d) =>
        auditService.log(d, "تغییر رمز عبور", "user", userId, `رمز ${target.name} بازنشانی شد`)
      );
    });
  },
};
