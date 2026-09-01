// @ts-nocheck
/**
 * پشتیبان‌گیری و بازیابی کامل — مخصوص مدیر
 * این خروجی با «گزارش PDF» و «JSON هوش مصنوعی» متفاوت است:
 * هدف آن بازسازی کامل وضعیت کسب‌وکار است.
 *
 * - هیچ رمز خام، توکن نشست یا داده امنیتی در پشتیبان نیست (فقط هش رمزها برای بازگرداندن کاربران)
 * - بازیابی فقط اتمیک است: یا کامل انجام می‌شود یا هیچ‌چیز تغییر نمی‌کند
 * - قبل از هر بازیابی، پشتیبان اضطراری از وضعیت فعلی گرفته و دانلود می‌شود
 */
import type { DB } from "../domain/models";
import { getDB, mutate, prefsStore, restoreDB, snapshotStore } from "../storage/storage";
import { jalaliDate, jalaliStamp } from "../utils/format";
import { auditService } from "./auditService";
import { authService } from "./authService";

/** ساخت Blob پشتیبان با اعتبارسنجی — تحویل فایل بر عهدهٔ مرکز دانلود است */
function toBackupBlob(backup: BackupFile): Blob {
  const text = JSON.stringify(backup, null, 2);
  JSON.parse(text); // بازاعتبارسنجی
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  if (blob.size === 0) throw new Error("ساخت فایل پشتیبان انجام نشد — خروجی خالی است");
  return blob;
}

const APP_ID = "پدال";
const SCHEMA_VERSION = "1.0";
const COLLECTIONS = [
  "users",
  "categories",
  "bikes",
  "customers",
  "rentals",
  "payments",
  "maintenances",
  "subscriptions",
  "audit",
] as const;

export interface BackupFile {
  backup_type: string;
  schema_version: string;
  application: string;
  created_at: string;
  created_by: string;
  record_counts: Record<string, number>;
  data: DB;
}

export interface BackupPreview {
  createdAt: number;
  createdBy: string;
  customers: number;
  rentals: number;
  bikes: number;
  payments: number;
  maintenances: number;
  categories: number;
  users: number;
  subscriptions: number;
}

function buildRecordCounts(db: DB): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of COLLECTIONS) counts[c] = db[c].length;
  counts.accounts = db.settings.accounts.length;
  return counts;
}

export const backupService = {
  buildBackup(): BackupFile {
    const db = getDB();
    const me = authService.currentUser();
    return {
      backup_type: "full",
      schema_version: SCHEMA_VERSION,
      application: APP_ID,
      created_at: new Date().toISOString(),
      created_by: me?.username ?? "unknown",
      record_counts: buildRecordCounts(db),
      data: db,
    };
  },

  /**
   * ایجاد پشتیبان کامل + اعتبارسنجی + ثبت در تاریخچه.
   * تحویل فایل بر عهدهٔ مرکز دانلود است — اینجا هیچ «دانلود شد»ی اعلام نمی‌شود.
   */
  prepareBackup(): { blob: Blob; name: string } {
    const backup = this.buildBackup();
    const blob = toBackupBlob(backup);
    const name = `pedal-backup-${jalaliStamp(Date.now())}.json`;
    prefsStore.write("lastBackup", { at: Date.now(), name });
    mutate((draft) =>
      authService.withActor(draft, (d) =>
        auditService.log(
          d,
          "ایجاد پشتیبان",
          "backup",
          name,
          `پشتیبان کامل — ${Object.entries(backup.record_counts)
            .map(([k, v]) => `${k}: ${v}`)
            .join("، ")}`
        )
      )
    );
    return { blob, name };
  },

  /** اعتبارسنجی کامل فایل پشتیبان — در صورت مشکل، خطای فارسی پرتاب می‌شود */
  validate(raw: unknown): BackupFile {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("فایل انتخاب‌شده یک JSON معتبر نیست");
    }
    const f = raw as Partial<BackupFile>;
    if (f.application !== APP_ID) {
      throw new Error("این فایل، پشتیبان سامانه «دز رکاب» نیست");
    }
    if (f.backup_type !== "full") {
      throw new Error(`نوع پشتیبان «${f.backup_type ?? "?"}» پشتیبانی نمی‌شود`);
    }
    if (f.schema_version !== SCHEMA_VERSION) {
      throw new Error(
        `نسخه طرح‌واره ${f.schema_version ?? "?"} پشتیبانی نمی‌شود — نسخه مورد انتظار ${SCHEMA_VERSION}. این فایل با نسخه جدیدتری ساخته شده یا خراب است.`
      );
    }
    const data = f.data;
    if (!data || typeof data !== "object") {
      throw new Error("بخش داده‌ها (data) در فایل پشتیبان موجود نیست");
    }
    for (const c of COLLECTIONS) {
      if (!Array.isArray(data[c])) {
        throw new Error(`مجموعه «${c}» در پشتیبان موجود نیست یا خراب است`);
      }
    }
    if (!data.settings || typeof data.settings !== "object" || !Array.isArray(data.settings.accounts)) {
      throw new Error("تنظیمات سامانه در پشتیبان ناقص است");
    }

    /* سازگاری ارجاع‌ها */
    const custIds = new Set(data.customers.map((c) => c.id));
    const catIds = new Set(data.categories.map((c) => c.id));
    const rentalIds = new Set(data.rentals.map((r) => r.id));
    let orphans = 0;
    for (const r of data.rentals) {
      if (!custIds.has(r.customerId)) orphans++;
      for (const it of r.items ?? []) if (!catIds.has(it.categoryId)) orphans++;
    }
    for (const b of data.bikes) if (!catIds.has(b.categoryId)) orphans++;
    for (const p of data.payments) {
      if (p.rentalId && !rentalIds.has(p.rentalId)) orphans++;
    }
    if (orphans > 0) {
      throw new Error(`${orphans} ارجاع ناسازگار در داده‌ها پیدا شد — بازیابی انجام نمی‌شود`);
    }

    /* هم‌خوانی تعداد رکوردها با متادیتا */
    if (f.record_counts && typeof f.record_counts === "object") {
      for (const c of COLLECTIONS) {
        const expected = f.record_counts[c];
        if (expected !== undefined && expected !== data[c].length) {
          throw new Error(`تعداد رکوردهای «${c}» با متادیتای پشتیبان هم‌خوانی ندارد — فایل دستکاری شده است`);
        }
      }
    }
    return f as BackupFile;
  },

  preview(file: BackupFile): BackupPreview {
    const d = file.data;
    return {
      createdAt: Date.parse(file.created_at) || Date.now(),
      createdBy: file.created_by,
      customers: d.customers.length,
      rentals: d.rentals.length,
      bikes: d.bikes.length,
      payments: d.payments.length,
      maintenances: d.maintenances.length,
      categories: d.categories.length,
      users: d.users.length,
      subscriptions: (d.subscriptions ?? []).length,
    };
  },

  /**
   * بازیابی — فقط وقتی پشتیبان اضطراریِ وضعیت فعلی از قبل «ساخته و به کاربر ارائه» شده باشد.
   * caller باید emergencyName را از prepareBackup + مرکز دانلود گرفته باشد؛
   * بدون آن بازیابی اصلاً اجرا نمی‌شود تا هیچ‌کس بدون نسخه نجات، داده را جایگزین نکند.
   * خود بازیابی اتمیک است: یا کامل انجام می‌شود یا هیچ‌چیز تغییر نمی‌کند.
   */
  restore(file: BackupFile, emergencyName: string): void {
    if (!emergencyName || !emergencyName.trim()) {
      throw new Error("پیش از بازیابی، پشتیبان اضطراری از وضعیت فعلی ساخته و دریافت کنید");
    }
    const validated = this.validate(file); // اعتبارسنجی دوباره قبل از هر تغییری

    restoreDB(validated.data); // اتمیک — یا کامل یا هیچ

    mutate((draft) =>
      authService.withActor(draft, (d) =>
        auditService.log(
          d,
          "بازیابی پشتیبان",
          "backup",
          jalaliDate(Date.parse(validated.created_at)),
          `پشتیبانِ ${jalaliDate(Date.parse(validated.created_at)) || "نامشخص"} بازیابی شد — پشتیبان اضطراری: ${emergencyName}`
        )
      )
    );
  },

  /* ------------------------- پشتیبان خودکار سبک ------------------------- */

  autoBackupIfNeeded(): void {
    const today = jalaliDate(Date.now());
    const last = prefsStore.read<string | null>("autobackupDay", null);
    if (last === today) return;
    try {
      snapshotStore.write(JSON.stringify(this.buildBackup()));
      prefsStore.write("autobackupDay", today);
    } catch {
      /* حافظه پر — پشتیبان خودکار اختیاری است */
    }
  },

  /** آخرین اسنپ‌شات محلی (خودکار) — برای «دانلود آخرین پشتیبان» */
  latestSnapshot(): BackupFile | null {
    const raw = snapshotStore.read();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as BackupFile;
      return this.validate(parsed);
    } catch {
      return null;
    }
  },

  /** آخرین پشتیبان (اسنپ‌شات خودکار یا یک پشتیبان تازه) — آماده برای مرکز دانلود */
  prepareLatest(): { blob: Blob; name: string } {
    const snap = this.latestSnapshot();
    if (snap) {
      const name = `pedal-backup-${jalaliStamp(Date.parse(snap.created_at) || Date.now())}.json`;
      return { blob: toBackupBlob(snap), name };
    }
    return this.prepareBackup();
  },

  /** پشتیبان اضطراریِ قبل از بازیابی — بدون ثبت «ایجاد پشتیبان» در تاریخچه */
  prepareEmergency(): { blob: Blob; name: string } {
    const backup = this.buildBackup();
    const blob = toBackupBlob(backup);
    const name = `current-state-before-restore-${jalaliStamp(Date.now())}.json`;
    prefsStore.write("lastBackup", { at: Date.now(), name });
    return { blob, name };
  },

  lastBackupInfo(): { at: number; name: string } | null {
    return prefsStore.read<{ at: number; name: string } | null>("lastBackup", null);
  },
};
