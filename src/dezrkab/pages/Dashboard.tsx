// @ts-nocheck
import { useEffect } from "react";
import type { DB, Rental } from "../domain/models";
import { navigate, useAuth, useNow } from "../state/app";
import { availabilityService } from "../services/availabilityService";
import { useDB } from "../storage/storage";
import {
  accountKindLabel,
  faNum,
  faPhone,
  fmtTime,
  isSameDay,
  minutesWords,
  money,
} from "../utils/format";
import { STATUS_LABEL } from "../services/rentalService";
import { Badge, Empty } from "../ui/kit";
import {
  IconArrowLeft,
  IconBike,
  IconCash,
  IconClock,
  IconReturn,
} from "../ui/icons";
import bikeBg from "@/assets/bike-bg.png";
import bikeOutline from "@/assets/bike-outline.png";

function CardWatermark({ className = "" }: { className?: string }) {
  return (
    <img
      src={bikeOutline}
      alt=""
      aria-hidden="true"
      loading="lazy"
      width={1024}
      height={768}
      className={`pointer-events-none absolute select-none opacity-[0.14] ${className}`}
    />
  );
}


/**
 * موج قطره‌ای: مختصات موس روی کارت می‌نشیند؛ موج فقط تا وقتی موس حرکت دارد دیده می‌شود
 * و با توقف/خروج موس مثل دود به‌آرامی محو می‌شود.
 */
function useWaveCursor() {
  useEffect(() => {
    let last: HTMLElement | null = null;
    let timer: number | undefined;
    const clear = () => {
      if (last) last.removeAttribute("data-ripple");
      last = null;
    };
    const onMove = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".wave") as HTMLElement | null;
      if (el !== last) {
        clear();
        last = el;
      }
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
      el.setAttribute("data-ripple", "1");
      window.clearTimeout(timer);
      timer = window.setTimeout(clear, 150);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.clearTimeout(timer);
    };
  }, []);
}

function greeting(hour: number): string {
  if (hour < 5) return "شب‌زنده‌داری بخیر";
  if (hour < 12) return "صبح بخیر";
  if (hour < 17) return "ظهر بخیر";
  if (hour < 21) return "عصر بخیر";
  return "شب بخیر";
}

export default function Dashboard() {
  useWaveCursor();
  const db = useDB();
  const { user } = useAuth();
  const now = useNow(15_000);

  const availability = availabilityService.snapshot(db, now);
  const todayRentals = db.rentals.filter((r) => isSameDay(r.createdAt, now));
  const hour = new Date(now).getHours();

  return (
    <div className="space-y-4">
      {/* ردیف ۱: دکمه بزرگ اجاره (اول) + دوچرخه‌های موجود */}
      <div className="grid gap-3 xl:grid-cols-12">
        <button
          onClick={() => navigate("rental")}
          className="wave anim-up group relative order-first overflow-hidden rounded-2xl bg-brand p-6 text-start text-white shadow-[0_10px_30px_rgba(29,98,214,0.35)] transition-all duration-200 hover:bg-branddeep hover:shadow-[0_14px_36px_rgba(29,98,214,0.45)] cursor-pointer xl:col-span-4"
        >
          <img
            src={bikeBg}
            alt=""
            aria-hidden="true"
            loading="lazy"
            width={1280}
            height={896}
            className="pointer-events-none absolute -bottom-6 -left-8 w-2/3 max-w-[320px] select-none opacity-[0.38] transition-transform duration-500 group-hover:scale-105"
          />
          <div
            className="pointer-events-none absolute -left-10 -top-10 size-48 rounded-full opacity-25 transition-transform duration-300 group-hover:scale-125"
            style={{ background: "radial-gradient(circle, #fff 0%, transparent 60%)" }}
          />
          <span className="relative grid size-16 place-items-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <IconBike size={38} />
          </span>
          <h2 className="relative mt-4 font-display text-4xl leading-tight">اجاره دوچرخه</h2>
          <p className="relative mt-1 text-sm text-white/85">شروع اجاره جدید</p>
          <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-white/90">
            ورود به پیشخوان اجاره
            <IconArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-1" />
          </span>
        </button>

        <div className="xl:col-span-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {availability.map((a, i) => (
              <button
                key={a.category.id}
                onClick={() => navigate(`rental?cat=${a.category.code}`)}
                style={{ animationDelay: `${i * 45}ms` }}
                className={`wave anim-up card group relative cursor-pointer overflow-hidden p-3 text-start transition-all duration-200 hover:border-brand/50 hover:shadow-[0_6px_20px_rgba(30,30,25,0.08)] ${
                  a.available === 0 ? "border-danger/40 bg-dangersoft/30 hover:border-danger/60" : ""
                }`}
              >
                <img
                  src={bikeOutline}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  width={1024}
                  height={768}
                  className="pointer-events-none absolute -bottom-3 -left-4 w-28 select-none opacity-[0.16] transition-transform duration-500 group-hover:scale-110"
                />
                <p className="relative text-[10px] font-extrabold tracking-wide text-inkmute">
                  دوچرخه‌های موجود
                </p>
                <div className="relative mt-1 flex items-center justify-between">
                  {a.available > 0 ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-ok">
                      <span className="dot-live inline-block size-2 rounded-full bg-ok" />
                      موجود
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-danger">
                      <span className="inline-block size-2 rounded-full bg-danger" />
                      موجود
                    </span>
                  )}
                  <span
                    className={`num font-display text-4xl leading-none ${
                      a.available > 0 ? "text-ok" : "text-danger"
                    }`}
                  >
                    {faNum(a.available)}
                  </span>
                </div>
                <div className="relative mt-2 flex items-center gap-1.5">
                  <span className="grid size-7 place-items-center rounded-md bg-coal font-display text-base text-white">
                    {a.category.code}
                  </span>
                  <span className="text-xs font-bold text-inksoft">{a.category.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>


      {/* ردیف ۲: در حال رکاب — تمام عرض */}
      <ActiveRentalsBoard db={db} />

      {/* ردیف ۳: امروز (فشرده) */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="wave anim-up card relative overflow-hidden transition-all duration-200 hover:border-brand/50 hover:shadow-[0_6px_20px_rgba(30,30,25,0.08)]">
          <CardWatermark className="-bottom-6 -left-8 w-52" />
          <div className="relative flex items-center justify-between border-b border-line px-4 py-2.5">

            <h3 className="font-display text-base text-ink">اجاره‌های امروز</h3>
            <Badge tone="neutral">{faNum(todayRentals.length)} اجاره</Badge>
          </div>
          {todayRentals.length === 0 ? (
            <Empty icon={<IconClock size={24} />} text="هنوز اجاره‌ای ثبت نشده" />
          ) : (
            <ul className="max-h-52 divide-y divide-line overflow-y-auto">
              {todayRentals.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="num w-12 font-display text-sm text-inksoft">#{faNum(r.number)}</span>
                  <span className="flex-1 truncate text-sm font-bold text-ink">
                    {customerName(db, r.customerId)}
                    <span className="ms-2 text-[11px] font-normal text-inkmute">
                      {r.items.map((i) => `${faNum(i.qty)}×${i.name}`).join(" + ")}
                    </span>
                  </span>
                  <span className="num text-xs font-bold text-inksoft">{money(r.total)}</span>
                  <Badge tone={r.status === "CANCELLED" ? "danger" : r.status === "SETTLED" || r.status === "COMPLETED" ? "ok" : "brand"}>
                    {STATUS_LABEL[r.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="wave anim-up card relative overflow-hidden transition-all duration-200 hover:border-brand/50 hover:shadow-[0_6px_20px_rgba(30,30,25,0.08)]" style={{ animationDelay: "60ms" }}>
          <CardWatermark className="-bottom-6 -left-8 w-52" />
          <div className="relative flex items-center justify-between border-b border-line px-4 py-2.5">

            <h3 className="font-display text-base text-ink">دریافتی‌های امروز</h3>
            <IconCash size={17} className="text-inkmute" />
          </div>
          <TodayMoney db={db} now={now} greeting={greeting(hour)} user={user?.name ?? ""} />
        </div>
      </div>
    </div>
  );
}

function customerName(db: DB, id: string): string {
  return db.customers.find((c) => c.id === id)?.name ?? "مشتری حذف‌شده";
}

/* ------------------------- تابلوی در حال رکاب ------------------------- */

function ActiveRentalsBoard({ db }: { db: DB }) {
  const now = useNow(1000);
  const grace = db.settings.graceMinutes;
  /* ترتیب بر اساس فوریت: دیرکرده‌ها (قدیمی‌ترین اول) سپس نزدیک‌ترین سررسید */
  const rentals = db.rentals
    .filter((r) => r.status === "ACTIVE" || r.status === "PARTIAL")
    .sort((a, b) => a.plannedEndAt - b.plannedEndAt);
  const rentedUnits = db.bikes.filter((b) => b.status === "RENTED").length;
  const maintUnits = db.bikes.filter((b) => b.status === "MAINTENANCE").length;
  const outUnits = db.bikes.filter((b) => b.status === "OUT_OF_SERVICE").length;

  return (
    <section className="wave anim-up card relative overflow-hidden transition-all duration-200 hover:border-brand/50 hover:shadow-[0_6px_20px_rgba(30,30,25,0.08)]">
      <CardWatermark className="-bottom-10 -left-10 w-64" />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line px-4 py-2.5">

        <h2 className="flex items-center gap-2 font-display text-xl text-ink">
          <IconBike size={20} className="text-branddeep" />
          در حال رکاب
        </h2>
        <Badge tone="brand">{faNum(rentals.length)} اجاره فعال</Badge>
        <div className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-inksoft">
          <span className="num">{faNum(rentedUnits)} دستگاه بیرون</span>
          <span className="num text-[#b45309]">{faNum(maintUnits)} تعمیر</span>
          <span className="num text-inkmute">{faNum(outUnits)} خارج</span>
          <button onClick={() => navigate("bikes")} className="cursor-pointer text-branddeep hover:underline">
            جزئیات
          </button>
        </div>
      </div>

      {rentals.length === 0 ? (
        <Empty
          icon={<IconReturn size={26} />}
          text="هیچ دوچرخه‌ای بیرون نیست"
          sub="با «اجاره دوچرخه» اولین رکاب‌سوار را ثبت کنید"
        />
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {rentals.map((r) => (
            <RentalCard key={r.id} db={db} rental={r} now={now} grace={grace} />
          ))}
        </div>
      )}
    </section>
  );
}

function RentalCard({
  db,
  rental,
  now,
  grace,
}: {
  db: DB;
  rental: Rental;
  now: number;
  grace: number;
}) {
  const customer = db.customers.find((c) => c.id === rental.customerId);
  const diff = rental.plannedEndAt - now;
  const lateMinutes = diff < 0 ? Math.ceil(-diff / 60_000) : 0;
  const overdue = diff <= 0;
  const warning = !overdue && diff <= 15 * 60_000;

  const outstanding = rental.items.filter((i) => i.qty - i.returnedQty > 0);

  return (
    <div
      className={`wave flex flex-col gap-1.5 rounded-xl border-2 bg-white px-3.5 py-2.5 transition-all duration-200 ${
        overdue
          ? "border-mango/60 bg-mangosoft/50 shadow-[0_4px_16px_rgba(245,166,35,0.18)]"
          : warning
            ? "border-warn/50 bg-warnsoft/35"
            : "border-line hover:border-brand/50 hover:shadow-[0_6px_20px_rgba(30,30,25,0.08)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg leading-6 text-ink">
            {customer?.name ?? "مشتری"}
            {customer?.phone && (
              <span
                className="ms-4 inline-block align-middle rounded-md bg-black/[0.05] px-2.5 py-0.5 text-sm font-extrabold text-ink"
                dir="ltr"
              >
                {faPhone(customer.phone)}
              </span>
            )}
            {rental.status === "PARTIAL" && (
              <Badge tone="warn" className="ms-2 align-middle">برگشت نسبی</Badge>
            )}
          </p>
          <p className="num text-[11px] text-inkmute">
            اجاره #{faNum(rental.number)} · شروع {fmtTime(rental.startAt)}
          </p>
        </div>
        <RemainingPill lateMinutes={lateMinutes} overdue={overdue} warning={warning} plannedEndAt={rental.plannedEndAt} now={now} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {outstanding.map((i) => (
              <span
                key={i.categoryId}
                className="num inline-flex items-baseline gap-1 rounded-lg bg-brandsoft px-2.5 py-1 text-sm font-extrabold text-branddeep"
              >
                <span className="num font-display text-xl leading-6">{faNum(i.qty - i.returnedQty)}</span>
                عدد {i.name}
              </span>
            ))}
          </div>
          <p className="num flex items-center gap-1 text-sm font-extrabold text-inksoft">
            <IconClock size={15} className={overdue ? "text-mangodeep" : "text-inkmute"} />
            بازگشت:
            <span className="num font-display text-xl leading-6 text-ink">{fmtTime(rental.plannedEndAt)}</span>
            <span className="text-[10px] font-normal text-inkmute">· {faNum(grace)} دقیقه بخشودگی</span>
          </p>
        </div>
        <button
          onClick={() => navigate(`returns?id=${rental.id}`)}
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-brand px-5 py-2 font-display text-base text-white shadow-[0_4px_14px_rgba(29,98,214,0.3)] transition-all duration-150 hover:bg-branddeep active:scale-[0.98]"
        >
          <IconReturn size={17} />
          ثبت برگشت
        </button>
      </div>
    </div>
  );
}

function RemainingPill({
  lateMinutes,
  overdue,
  warning,
  plannedEndAt,
  now,
}: {
  lateMinutes: number;
  overdue: boolean;
  warning: boolean;
  plannedEndAt: number;
  now: number;
}) {
  if (overdue) {
    return (
      <div className="dot-warn shrink-0 rounded-xl border border-mangodeep/40 bg-mango px-3.5 py-2 text-end shadow-[0_4px_14px_rgba(245,166,35,0.35)]">
        <p className="num font-display text-xl leading-6 text-white">{minutesWords(lateMinutes)}</p>
        <p className="text-[10px] font-bold text-white/85">دیرکرد</p>
      </div>
    );
  }
  const remaining = Math.floor((plannedEndAt - now) / 60_000);
  if (warning) {
    return (
      <div className="shrink-0 rounded-xl bg-warnsoft px-3.5 py-2 text-end">
        <p className="num font-display text-xl leading-6 text-[#b45309]">{minutesWords(Math.max(0, remaining))}</p>
        <p className="text-[10px] font-bold text-[#b45309]">باقی مانده</p>
      </div>
    );
  }
  return (
    <div className="shrink-0 rounded-xl bg-oksoft px-3.5 py-2 text-end">
      <p className="num font-display text-xl leading-6 text-ok">{minutesWords(Math.max(0, remaining))}</p>
      <p className="text-[10px] font-bold text-ok">باقی مانده</p>
    </div>
  );
}

/* --------------------------- دریافتی امروز --------------------------- */

function TodayMoney({ db, now }: { db: DB; now: number; greeting: string; user: string }) {
  const pays = db.payments.filter((p) => isSameDay(p.createdAt, now));
  const rent = pays
    .filter((p) => p.kind === "RENT" || p.kind === "CORRECTION" || p.kind === "DEPOSIT_APPLY")
    .reduce((s, p) => s + p.amount, 0);

  return (
    <div className="p-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-bold text-inkmute">درآمد اجاره امروز</p>
          <p className="num mt-1 font-display text-3xl text-ink">{money(rent)}</p>
        </div>
      </div>
      <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto">
        {pays.length === 0 ? (
          <li className="py-2 text-center text-xs font-bold text-inkmute">امروز دریافتی ثبت نشده</li>
        ) : (
          pays.slice(0, 6).map((p) => {
            const r = db.rentals.find((x) => x.id === p.rentalId);
            const acc = db.settings.accounts.find((a) => a.id === p.accountId);
            return (
              <li key={p.id} className="flex items-center justify-between rounded-lg bg-black/[0.03] px-3 py-1.5 text-xs">
                <span className="font-bold text-inksoft">
                  #{r ? faNum(r.number) : "—"} — {acc ? accountKindLabel(acc.kind) : "پرداخت"}
                </span>
                <span className={`num font-extrabold ${p.amount < 0 ? "text-danger" : "text-ok"}`}>
                  {money(p.amount)}
                </span>
              </li>
            );
          })
        )}
      </ul>
      <button
        onClick={() => navigate("payments")}
        className="mt-3 inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-branddeep hover:underline"
      >
        همه پرداخت‌ها
        <IconArrowLeft size={13} />
      </button>
    </div>
  );
}
