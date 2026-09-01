// @ts-nocheck
/**
 * لایه وضعیت اپ — روتر سبک hash، زمینه احراز هویت، ساعت زنده
 * هیچ قانون کسب‌وکاری اینجا نیست؛ فقط اتصال UI به سرویس‌ها
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../domain/models";
import { authService } from "../services/authService";
import { useDB } from "../storage/storage";

/* --------------------------------- روتر --------------------------------- */

export interface Route {
  path: string;
  params: URLSearchParams;
}

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [p, q] = h.split("?");
  return { path: p || "dashboard", params: new URLSearchParams(q ?? "") };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith("#") ? to : `#/${to}`;
}

/* ------------------------------ ساعت زنده ------------------------------ */

export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/* ------------------------------- احراز هویت ------------------------------- */

interface AuthCtxType {
  user: User | null;
  doLogin: (username: string, password: string) => void;
  doLogout: () => void;
}

const AuthCtx = createContext<AuthCtxType>({
  user: null,
  doLogin: () => {},
  doLogout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // هر تغییر داده + هر ورود/خروج → بازخوانی کاربر جاری از نشست پایدار
  const db = useDB();
  const [tick, setTick] = useState(0);

  const user = useMemo(() => {
    void db;
    return authService.currentUser();
  }, [db, tick]);

  /* اعتبارسنجی دوره‌ای نشست — انقضای ۱۲ ساعته یا غیرفعال‌شدن کاربر وسط کار */
  useEffect(() => {
    const t = window.setInterval(() => {
      const had = authService.hasSession();
      const u = authService.validateSession();
      if (had && !u) setTick((x) => x + 1); // نشست باطل شد → بازگشت به صفحه ورود
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  const doLogin = useCallback((username: string, password: string) => {
    authService.login(username, password);
    setTick((t) => t + 1);
  }, []);

  const doLogout = useCallback(() => {
    authService.logout();
    setTick((t) => t + 1);
    navigate("dashboard");
  }, []);

  return (
    <AuthCtx.Provider value={{ user, doLogin, doLogout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthCtxType {
  return useContext(AuthCtx);
}
