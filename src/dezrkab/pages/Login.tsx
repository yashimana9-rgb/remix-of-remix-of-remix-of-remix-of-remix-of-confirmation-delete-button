// @ts-nocheck
import { useState, type FormEvent } from "react";
import { navigate, useAuth, useNow } from "../state/app";
import { authService } from "../services/authService";
import { useDB } from "../storage/storage";
import { fmtDateFull, fmtTime, fmtWeekday } from "../utils/format";

import { Btn } from "../ui/kit";
import { IconBike, IconGear, IconLock, IconUser } from "../ui/icons";

function Wheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="3.5" />
      <g
        className="wheel-spin"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        stroke="#1d62d6"
        strokeWidth="2"
      >
        <line x1={cx - r + 4} y1={cy} x2={cx + r - 4} y2={cy} />
        <line x1={cx} y1={cy - r + 4} x2={cx} y2={cy + r - 4} />
        <line x1={cx - r + 7} y1={cy - r + 7} x2={cx + r - 7} y2={cy + r - 7} />
        <line x1={cx - r + 7} y1={cy + r - 7} x2={cx + r - 7} y2={cy - r + 7} />
      </g>
      <circle cx={cx} cy={cy} r="3.5" fill="#1d62d6" />
    </g>
  );
}

function BikeArt() {
  return (
    <svg viewBox="0 0 230 130" className="w-full max-w-sm text-white/90" aria-hidden>
      <Wheel cx={52} cy={92} r={30} />
      <Wheel cx={178} cy={92} r={30} />
      <g stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M52 92 92 46h42l44 46" />
        <path d="M92 46 116 92h-64M116 92 134 46" />
        <path d="M88 38h14M134 46l6-12h12" />
      </g>
      <circle cx="116" cy="92" r="5" fill="#1d62d6" />
    </svg>
  );
}

export default function Login() {
  const db = useDB();
  const { doLogin } = useAuth();
  const now = useNow(1000);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [errKey, setErrKey] = useState(0);
  const [busy, setBusy] = useState(false);

  /* راه‌اندازی اولیه — فقط وقتی هیچ مدیر فعالی وجود ندارد */
  const needsSetup = authService.needsSetup();
  const [suName, setSuName] = useState("");
  const [suUser, setSuUser] = useState("");
  const [suPass, setSuPass] = useState("");
  const [suPass2, setSuPass2] = useState("");
  const [suErr, setSuErr] = useState("");
  const [suErrKey, setSuErrKey] = useState(0);
  const [suDone, setSuDone] = useState(false);
  const [expiredNote] = useState(() => authService.takeExpiredNotice());

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    window.setTimeout(() => {
      try {
        doLogin(username, password);
        navigate("dashboard");
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "ورود ناموفق بود");
        setErrKey((k) => k + 1);
      } finally {
        setBusy(false);
      }
    }, 350);
  }

  function submitSetup(e: FormEvent) {
    e.preventDefault();
    setSuErr("");
    if (suPass !== suPass2) {
      setSuErr("رمز عبور و تکرار آن یکسان نیست");
      setSuErrKey((k) => k + 1);
      return;
    }
    try {
      authService.createFirstManager({ name: suName, username: suUser, password: suPass });
      setSuDone(true); // با ساخته‌شدن مدیر، needsSetup خاموش می‌شود و فرم ورود جایگزین می‌شود
    } catch (ex) {
      setSuErr(ex instanceof Error ? ex.message : "ایجاد حساب ناموفق بود");
      setSuErrKey((k) => k + 1);
    }
  }

  return (
    <div dir="rtl" lang="fa" className="flex min-h-screen">
      {/* پنل برند */}
      <aside className="dots-bg relative hidden flex-1 flex-col justify-between overflow-hidden bg-coal p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #1d62d6 0%, transparent 65%)" }}
        />
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-brand text-white shadow-[0_6px_20px_rgba(29,98,214,0.4)]">
            <IconBike size={26} />
          </span>
          <div>
            <h1 className="font-display text-2xl leading-7">باشگاه دوچرخه‌سواری دز رکاب</h1>
            <p className="text-xs text-white/50">سامانه داخلی اجاره حضوری دوچرخه</p>
          </div>
        </div>

        <div className="anim-up flex flex-col items-start gap-6">
          <BikeArt />
          <div>
            <h2 className="font-display text-4xl leading-tight text-white">
              پیشخوانِ رکاب‌زنانِ امروز
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-7 text-white/60">
              موجودی زنده دسته‌ها، اجاره حضوری در چند ثانیه، برگشت و تسویه شفاف —
              همه در یک پنجره کاری.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["موجودی زنده", "اجاره حضوری", "تسویه سریع", "گزارش روزانه"].map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="num font-display text-4xl text-white">{fmtTime(now)}</p>
            <p className="mt-1 text-xs text-white/50">
              {fmtWeekday(now)} — {fmtDateFull(now)}
            </p>
          </div>
          <p className="text-[11px] text-white/35">نسخه داخلی فروشگاه — تک‌شعبه‌ای</p>
        </div>
      </aside>

      {/* فرم ورود */}
      <main className="flex flex-1 items-center justify-center bg-paper p-6">
        <div className="anim-pop w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-brand text-white">
              <IconBike size={22} />
            </span>
            <h1 className="font-display text-2xl leading-8">باشگاه دوچرخه‌سواری دز رکاب</h1>
          </div>

          {suDone && !needsSetup ? (
            <div className="anim-pop mb-4 rounded-xl border border-ok/30 bg-oksoft px-4 py-3 text-xs font-bold text-ok">
              حساب مدیر ساخته شد — حالا با نام کاربری و رمز خود وارد شوید
            </div>
          ) : null}

          {expiredNote && !needsSetup && !suDone ? (
            <div className="anim-pop mb-4 rounded-xl border border-warn/40 bg-warnsoft px-4 py-3 text-xs font-bold text-[#b45309]">
              نشست شما به پایان رسید — لطفاً دوباره وارد شوید
            </div>
          ) : null}

          <div className="card p-6">
            {needsSetup ? (
              /* ---------- راه‌اندازی اولیه: ساخت اولین مدیر ---------- */
              <>
                <div className="flex items-center gap-2.5">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand text-white shadow-[0_6px_18px_rgba(29,98,214,0.3)]">
                    <IconGear size={20} />
                  </span>
                  <div>
                    <h2 className="font-display text-2xl leading-7 text-ink">راه‌اندازی اولیه</h2>
                    <p className="text-[11px] font-bold text-branddeep">ساخت اولین حساب مدیر فروشگاه</p>
                  </div>
                </div>
                <p className="mt-3 rounded-lg bg-black/[0.03] px-3 py-2.5 text-[11px] leading-6 text-inksoft">
                  هنوز حساب مدیری وجود ندارد. نام کاربری و رمز عبور را خودتان انتخاب کنید —
                  این مرحله فقط یک‌بار انجام می‌شود و بعد از ساخت مدیر بسته می‌شود.
                </p>

                {suErr ? (
                  <div
                    key={suErrKey}
                    className="anim-shake mt-3 rounded-lg border border-danger/30 bg-dangersoft px-3 py-2.5 text-xs font-bold text-danger"
                  >
                    {suErr}
                  </div>
                ) : null}

                <form onSubmit={submitSetup} className="mt-4 space-y-3.5">
                  <div>
                    <label className="lbl">نام و نام خانوادگی مدیر</label>
                    <input
                      className="inp"
                      value={suName}
                      onChange={(e) => setSuName(e.target.value)}
                      placeholder="مثلاً: امیر تهرانی"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="lbl">نام کاربری</label>
                    <div className="relative">
                      <input
                        className="inp pe-3 ps-10"
                        dir="ltr"
                        style={{ textAlign: "left" }}
                        value={suUser}
                        onChange={(e) => setSuUser(e.target.value)}
                        placeholder="username"
                      />
                      <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-inkmute">
                        <IconUser size={17} />
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="lbl">رمز عبور</label>
                      <div className="relative">
                        <input
                          className="inp pe-3 ps-10"
                          dir="ltr"
                          style={{ textAlign: "left" }}
                          type="password"
                          value={suPass}
                          onChange={(e) => setSuPass(e.target.value)}
                          placeholder="••••••"
                        />
                        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-inkmute">
                          <IconLock size={17} />
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="lbl">تکرار رمز عبور</label>
                      <div className="relative">
                        <input
                          className="inp pe-3 ps-10"
                          dir="ltr"
                          style={{ textAlign: "left" }}
                          type="password"
                          value={suPass2}
                          onChange={(e) => setSuPass2(e.target.value)}
                          placeholder="••••••"
                        />
                        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-inkmute">
                          <IconLock size={17} />
                        </span>
                      </div>
                    </div>
                  </div>
                  <Btn type="submit" size="lg" className="w-full">
                    ساخت حساب مدیر
                  </Btn>
                  <p className="text-center text-[10px] leading-5 text-inkmute">
                    حساب فروشنده را بعداً مدیر از «تنظیمات ← کاربران» می‌سازد
                  </p>
                </form>
              </>
            ) : (
              /* ---------- فرم ورود ---------- */
              <>
            <h2 className="font-display text-2xl text-ink">ورود به سامانه</h2>
            <p className="mt-1 text-xs text-inksoft">برای ادامه، حساب کاربری خود را وارد کنید</p>

            {err ? (
              <div
                key={errKey}
                className="anim-shake mt-4 rounded-lg border border-danger/30 bg-dangersoft px-3 py-2.5 text-xs font-bold text-danger"
              >
                {err}
              </div>
            ) : null}

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="lbl">نام کاربری</label>
                <div className="relative">
                  <input
                    className="inp pe-3 ps-10"
                    dir="ltr"
                    style={{ textAlign: "left" }}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    autoFocus
                  />
                  <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-inkmute">
                    <IconUser size={17} />
                  </span>
                </div>
              </div>
              <div>
                <label className="lbl">رمز عبور</label>
                <div className="relative">
                  <input
                    className="inp pe-3 ps-10"
                    dir="ltr"
                    style={{ textAlign: "left" }}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                  />
                  <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-inkmute">
                    <IconLock size={17} />
                  </span>
                </div>
              </div>
              <Btn type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? "در حال بررسی…" : "ورود"}
              </Btn>
            </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
