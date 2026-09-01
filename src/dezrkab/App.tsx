// @ts-nocheck
import { useEffect, type ReactNode } from "react";
import { AuthProvider, navigate, useAuth, useNow, useRoute } from "./state/app";
import { can, type Perm } from "./services/authService";
import { backupService } from "./services/backupService";
import { useDB } from "./storage/storage";
import { faNum, faPhone, fmtDateFull, fmtTime, fmtWeekday } from "./utils/format";
import { Badge, Btn, ToastProvider } from "./ui/kit";
import { useEnterFlow } from "./ui/useEnterFlow";
import { DownloadProvider } from "./ui/DownloadCenter";
import {
  IconBike,
  IconCash,
  IconChart,
  IconDash,
  IconGear,
  IconLock,
  IconLogout,
  IconPlus,
  IconReceipt,
  IconReturn,
  IconUsers,
  IconWrench,
} from "./ui/icons";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Bikes from "./pages/Bikes";
import NewRental from "./pages/NewRental";
import Customers from "./pages/Customers";
import Returns from "./pages/Returns";
import Payments from "./pages/Payments";
import Maintenance from "./pages/Maintenance";
import Subscriptions from "./pages/Subscriptions";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

interface NavItem {
  path: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  perm?: Perm;
}

const NAV: NavItem[] = [
  { path: "dashboard", label: "پیشخوان", icon: IconDash },
  { path: "bikes", label: "دوچرخه‌ها", icon: IconBike },
  { path: "customers", label: "مشتریان", icon: IconUsers },
  { path: "returns", label: "برگشت", icon: IconReturn, perm: "return.process" },
  { path: "payments", label: "پرداخت", icon: IconCash, perm: "payment.receive" },
  { path: "maintenance", label: "تعمیرات", icon: IconWrench, perm: "maintenance.manage" },
  { path: "subscriptions", label: "اشتراک‌ها", icon: IconReceipt, perm: "subscription.manage" },
  { path: "reports", label: "آمار و گزارش", icon: IconChart, perm: "reports.view" },
  { path: "settings", label: "تنظیمات", icon: IconGear, perm: "settings.manage" },
];

/** مسیر اجاره — از «پیشخوان» وارد می‌شود؛ عمداً در منوی کناری نمایش داده نمی‌شود */
const RENTAL_ROUTE: NavItem = {
  path: "rental",
  label: "شروع اجاره",
  icon: IconBike,
  perm: "rental.create",
};

function Forbidden() {
  return (
    <div className="anim-pop card mx-auto mt-16 max-w-sm p-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-dangersoft text-danger">
        <IconLock size={26} />
      </span>
      <h2 className="mt-3 font-display text-xl text-ink">دسترسی محدود است</h2>
      <p className="mt-1 text-xs leading-6 text-inksoft">
        این بخش مخصوص مدیر فروشگاه است. برای انجام این کار با مدیر صحبت کنید.
      </p>
      <Btn className="mt-4" onClick={() => navigate("dashboard")}>
        بازگشت به پیشخوان
      </Btn>
    </div>
  );
}

function Shell() {
  const { user, doLogout } = useAuth();
  const route = useRoute();
  const db = useDB();
  const now = useNow(1000);

  useEffect(() => {
    if (user) backupService.autoBackupIfNeeded();
  }, [user?.id]);

  if (!user) return <Login />;

  const nav = NAV.filter((n) => !n.perm || can(user, n.perm));
  /* مسیر اجاره در منو نیست ولی باید به‌درستی resolve شود — وگرنه پیشخوان جایگزینش می‌شد */
  const active =
    NAV.find((n) => n.path === route.path) ??
    (route.path === RENTAL_ROUTE.path ? RENTAL_ROUTE : NAV[0]);
  const allowed = !active.perm || can(user, active.perm);

  return (
    <div dir="rtl" lang="fa" className="flex min-h-screen bg-paper">
      {/* سایدبار */}
      <aside className="sticky top-0 hidden h-screen w-[226px] shrink-0 flex-col justify-between bg-coal lg:flex">
        <div>
          <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
            <span className="grid size-10 place-items-center rounded-xl bg-brand text-white shadow-[0_6px_18px_rgba(29,98,214,0.35)]">
              <IconBike size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg leading-6 text-white">دز رکاب</h1>
              <p className="truncate text-[10px] text-white/45">باشگاه دوچرخه‌سواری دز رکاب</p>
              <p className="num truncate text-[10px] text-white/40" dir="ltr">{faPhone(db.settings.receiptPhone)}</p>
            </div>
          </div>
          <nav className="space-y-1 px-3">
            {nav.map((n) => {
              /* هنگام اجاره، «پیشخوان» روشن می‌ماند چون اجاره از همان‌جا شروع شده */
              const isActive =
                route.path === n.path ||
                (route.path === RENTAL_ROUTE.path && n.path === "dashboard");
              return (
                <button
                  key={n.path}
                  onClick={() => navigate(n.path)}
                  className={`relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all duration-150 ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/55 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {isActive && (
                    <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-brand" />
                  )}
                  <n.icon size={19} />
                  {n.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3">
          <button
            onClick={() => navigate("rental")}
            className="mb-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-extrabold text-white shadow-[0_6px_18px_rgba(29,98,214,0.35)] transition-all hover:bg-branddeep"
          >
            <IconPlus size={16} />
            اجاره جدید
          </button>
          <div className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full font-display text-sm text-white ${
                user.role === "MANAGER" ? "bg-brand" : "bg-coal3"
              }`}
            >
              {user.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-extrabold text-white">{user.name}</p>
              <p className="text-[10px] text-white/45">
                {user.role === "MANAGER" ? "مدیر فروشگاه" : "فروشنده"}
              </p>
            </div>
            <button
              onClick={doLogout}
              className="cursor-pointer rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              title="خروج از سامانه"
            >
              <IconLogout size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* محتوای اصلی */}
      <div className="min-w-0 flex-1">
        {/* نوار بالای موبایل */}
        <div className="sticky top-0 z-40 flex items-center gap-2 overflow-x-auto bg-coal px-3 py-2.5 lg:hidden">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white">
            <IconBike size={17} />
          </span>
          {nav.map((n) => (
            <button
              key={n.path}
              onClick={() => navigate(n.path)}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                route.path === n.path || (route.path === RENTAL_ROUTE.path && n.path === "dashboard")
                  ? "bg-brand text-white"
                  : "bg-white/10 text-white/70"
              }`}
            >
              <n.icon size={13} />
              {n.label}
            </button>
          ))}
          <button
            onClick={doLogout}
            className="ms-auto shrink-0 cursor-pointer rounded-full bg-white/10 p-2 text-white/70"
            title="خروج"
          >
            <IconLogout size={14} />
          </button>
        </div>

        {/* هدر */}
        <header className="sticky top-0 z-30 hidden items-center justify-between border-b border-white/10 bg-coal2 px-6 py-3.5 lg:flex">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl text-white">{active.label}</h2>
            <Badge tone={user.role === "MANAGER" ? "brand" : "neutral"}>
              {user.role === "MANAGER" ? "مدیر" : "فروشنده"}
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-end">
              <p className="num font-display text-xl leading-5 text-white">{fmtTime(now)}</p>
              <p className="text-[10px] text-white/55">
                {fmtWeekday(now)} — {fmtDateFull(now)}
              </p>
            </div>
            <span className="h-8 w-px bg-white/15" />
            <div className="flex items-center gap-2 text-xs font-bold text-white/75">
              <span className="dot-live size-2 rounded-full bg-ok" />
              <span className="num">{faNum(db.bikes.filter((b) => b.status === "RENTED").length)} دستگاه بیرون</span>
            </div>
          </div>
        </header>


        <main className="dots-bg">
          <div key={route.path + String(allowed)} className="anim-up mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
            {!allowed ? (
              <Forbidden />
            ) : (
              <>
                {active.path === "dashboard" && <Dashboard />}
                {active.path === "bikes" && <Bikes />}
                {active.path === "rental" && <NewRental />}
                {active.path === "customers" && <Customers />}
                {active.path === "returns" && <Returns />}
                {active.path === "payments" && <Payments />}
                {active.path === "maintenance" && <Maintenance />}
                {active.path === "subscriptions" && <Subscriptions />}
                {active.path === "reports" && <Reports />}
                {active.path === "settings" && <Settings />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  useEnterFlow();
  return (
    <ToastProvider>
      <AuthProvider>
        <DownloadProvider>
          <Shell />
        </DownloadProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
