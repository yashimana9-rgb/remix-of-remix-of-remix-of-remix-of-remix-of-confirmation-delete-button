// @ts-nocheck
/** دامین مدل‌ها — تمام موجودیت‌های کسب‌وکار فروشگاه اجاره دوچرخه */

export type Role = "MANAGER" | "SELLER";

export interface User {
  id: string;
  name: string;
  username: string;
  passHash: string;
  role: Role;
  active: boolean;
  createdAt: number;
}

export interface SessionInfo {
  userId: string;
  loginAt: number;
  /** آخرین اعتبارسنجی موفق — صرفاً تشخیصی؛ عمر نشست مطلقاً از loginAt حساب می‌شود */
  lastValidatedAt?: number;
}

export interface Category {
  id: string;
  /** کد دسته — مثل A یا B — شناسه دسته است نه دوچرخه فیزیکی */
  code: string;
  name: string;
  hourlyRate: number;
  deposit: number;
  active: boolean;
  createdAt: number;
}

export type BikePhysicalStatus =
  | "AVAILABLE"
  | "RENTED"
  | "MAINTENANCE"
  | "OUT_OF_SERVICE";

export interface Bike {
  id: string;
  serial: string;
  categoryId: string;
  status: BikePhysicalStatus;
  rentalId: string | null;
  /** اگر دوچرخه در جریان یک تردد اشتراک بیرون باشد */
  subscriptionId?: string | null;
  maintenanceId: string | null;
  /** زودترین زمانی که دوچرخه دوباره قابل اجاره می‌شود (قانون گردش پس از برگشت زودهنگام) */
  availableAt: number;
  note: string;
  createdAt: number;
}


/** یک بار مصرف‌شدن تخفیف جایزه — برای تاریخچه مشتری */
export interface DiscountUse {
  at: number;
  rentalId: string;
  rentalNumber: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  idNumber: string;
  note: string;
  /** شمارنده ساعت‌های اجاره تکمیل‌شده برای پاداش — بعد از مصرف تخفیف صفر می‌شود */
  completedHours: number;
  discountUses: DiscountUse[];
  createdAt: number;
}

export type RentalStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PARTIAL"
  | "SETTLED"
  | "COMPLETED"
  | "CANCELLED";

export interface RentalItem {
  categoryId: string;
  code: string;
  name: string;
  qty: number;
  returnedQty: number;
  hourlyRate: number;
  deposit: number;
}

export interface Rental {
  id: string;
  number: number;
  customerId: string;
  items: RentalItem[];
  startAt: number;
  hours: number;
  plannedEndAt: number;
  actualEndAt: number | null;
  subtotal: number;
  discount: number;
  /** درصد تخفیف پاداش اعمال‌شده — برای ردیابی مصرف جایزه */
  discountRate: number;
  /** آیا تخفیف از سامانه پاداش مشتری آمده است؟ */
  discountAuto: boolean;
  lateFee: number;
  depositTotal: number;
  total: number;
  status: RentalStatus;
  note: string;
  cancelledAt: number | null;
  cancelReason: string;
  createdBy: string;
  createdAt: number;
}

export type PaymentKind =
  | "RENT"
  | "DEPOSIT"
  | "DEPOSIT_REFUND"
  | "DEPOSIT_APPLY"
  | "CORRECTION"
  /** اضافه‌دریافت از مشتری — بدهی ما به او، جزو درآمد نیست */
  | "CREDIT"
  /** مصرف بستانکاری مشتری روی یک فاکتور — همان لحظه به درآمد تبدیل می‌شود */
  | "CREDIT_APPLY";

export interface Payment {
  id: string;
  rentalId: string | null;
  /** اگر پرداخت بابت اشتراک باشد */
  subscriptionId?: string | null;
  kind: PaymentKind;
  /** مبلغ — برای اصلاحات می‌تواند منفی باشد */
  amount: number;
  accountId: string;
  note: string;
  operatorId: string;
  createdAt: number;
}

export type MaintenanceStatus = "OPEN" | "DONE";

export interface MaintenanceRecord {
  id: string;
  bikeId: string;
  serial: string;
  categoryId: string;
  reason: string;
  note: string;
  cost: number;
  startedAt: number;
  endedAt: number | null;
  status: MaintenanceStatus;
  byId: string;
}

export type SubscriptionStatus = "ACTIVE" | "FINISHED" | "CANCELLED";

/** یک تردد روزانه (رفت و برگشت) که از ساعت اشتراک کم می‌شود */
export interface SubscriptionSession {
  id: string;
  at: number;
  /** ساعت رفت — HH:MM */
  start: string;
  /** ساعت برگشت — HH:MM */
  end: string;
  hours: number;
  note: string;
  byId: string;
}

/** ردیف دوچرخه‌های اشتراک — با قیمت واقعی دسته و تعداد */
export interface SubscriptionItem {
  categoryId: string;
  code: string;
  name: string;
  qty: number;
  hourlyRate: number;
}

/** تردد بازِ اشتراک — دوچرخه‌ها بیرون هستند تا ثبت برگشت */
export interface OpenSubscriptionSession {
  id: string;
  /** ساعت رفت — HH:MM */
  start: string;
  startAt: number;
  bikeIds: string[];
  byId: string;
}

export interface Subscription {

  id: string;
  customerId: string;
  name: string;
  phone: string;
  idNumber: string;
  /** نوع اشتراک — دستی توسط فروشنده وارد می‌شود */
  planTitle: string;
  totalHours: number;
  usedHours: number;
  /** مجموع نرخ ساعتی همه دوچرخه‌های اشتراک (Σ تعداد × نرخ دسته) */
  hourlyRate: number;
  /** دوچرخه‌های اشتراک با تعداد و قیمت واقعی */
  items: SubscriptionItem[];
  /** تردد باز (دوچرخه‌ها بیرون‌اند) */
  openSession?: OpenSubscriptionSession | null;

  discountPercent: number;
  subtotal: number;
  discount: number;
  total: number;
  status: SubscriptionStatus;
  note: string;
  /** حساب دریافت وجه اشتراک — پرداخت همان لحظه ثبت می‌شود */
  accountId: string;
  /** شناسه سند پرداخت اشتراک */
  paymentId: string;
  /** مدت اعتبار اشتراک به روز */
  validDays: number;
  /** تاریخ پایان اعتبار اشتراک (میلی‌ثانیه) */
  expiresAt: number;
  sessions: SubscriptionSession[];
  createdBy: string;
  createdAt: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
}

export interface PaymentAccount {
  id: string;
  name: string;
  kind: string;
  active: boolean;
}

export interface DurationOption {
  hours: number;
  label: string;
}

export interface Settings {
  storeName: string;
  currency: string;
  graceMinutes: number;
  releaseDelayMinutes: number;
  lateMultiplier: number;
  /** زمان آماده‌سازی دوچرخه قبل از شروع اجاره — دقیقه (حداکثر ۵) */
  prepMinutes: number;
  /** هر چند ساعت اجاره تکمیل‌شده، یک تخفیف باز می‌شود */
  rewardThresholdHours: number;
  /** درصد تخفیف پاداش — روی کل فاکتور */
  rewardDiscountPercent: number;
  durations: DurationOption[];
  accounts: PaymentAccount[];
  /* ---------- متن‌های رسید حرارتی ۸۰mm — قابل ویرایش توسط مدیر ---------- */
  /** عنوان اصلی رسید (خط بزرگ) */
  receiptTitleMain: string;
  /** عنوان فرعی رسید (خط بالای آن) */
  receiptTitleSub: string;
  /** پیام تشکر */
  receiptThanks: string;
  /** شماره تماس پایین رسید */
  receiptPhone: string;
  /** قانون دیرکرد */
  receiptLateRule: string;
}

export interface DB {
  rev: number;
  /** متادیتای داخلی — انجام‌شدن پاک‌سازی یک‌بارهِ امنیتی M3 (جلوگیری از تکرار مهاجرت) */
  m3Cleaned?: boolean;
  /** پاک‌سازی یک‌باره داده‌های آزمایشی (آماده‌سازی برای شروع واقعی) */
  demoCleared?: boolean;
  seq: { rental: number };
  users: User[];
  categories: Category[];
  bikes: Bike[];
  customers: Customer[];
  rentals: Rental[];
  payments: Payment[];
  maintenances: MaintenanceRecord[];
  subscriptions: Subscription[];
  audit: AuditEntry[];
  settings: Settings;
}
