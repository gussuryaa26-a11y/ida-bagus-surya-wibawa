"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Gavel, GraduationCap, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const DEMO_ACCOUNTS = [
  {
    loginId: "20240001",
    name: "Putu Aditya Pratama",
    hint: "20240001 • BEM IDB Bali (DEMO)",
    icon: GraduationCap,
  },
  {
    loginId: "20240002",
    name: "Made Aditya Lestari",
    hint: "20240002 • HIMA Desain (DEMO)",
    icon: GraduationCap,
  },
  {
    loginId: "20240003",
    name: "Ketut Aditya Nugraha",
    hint: "20240003 • UKM Kreatif (DEMO)",
    icon: GraduationCap,
  },
  {
    loginId: "20240004",
    name: "Nyoman Aditya Maharani",
    hint: "20240004 • BEM IDB Bali (DEMO)",
    icon: GraduationCap,
  },
  {
    loginId: "20240005",
    name: "Wayan Aditya Ardhana",
    hint: "20240005 • HIMA Desain (DEMO)",
    icon: GraduationCap,
  },
  {
    loginId: "akademik",
    name: "Akademik",
    hint: "ID akademik • tinjau pengajuan",
    icon: Gavel,
  },
];

export function LoginForm() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function doLogin(id: string, pass: string, source: string) {
    setError(null);
    setPending(source);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: id, password: pass }),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
        redirectTo?: string;
      };
      if (!response.ok) {
        setError(payload.error?.message ?? "Login gagal. Periksa NIM/ID dan kata sandi.");
        return;
      }
      router.push(payload.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-brand-200 bg-brand-50 p-3" aria-label="Login demo cepat">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-brand-700">
            Demo cepat
          </p>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[0.62rem] font-semibold text-muted">
            Data DEMO
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((account) => {
            const Icon = account.icon;
            const loading = pending === account.loginId;
            return (
              <button
                key={account.loginId}
                type="button"
                disabled={pending !== null}
                onClick={() => void doLogin(account.loginId, "Demo1234!", account.loginId)}
                className="group flex items-start gap-2 rounded-xl border border-brand-200 bg-surface px-2.5 py-2 text-left transition-colors hover:border-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-white">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.82rem] font-semibold leading-tight text-ink">
                    {account.name}
                  </span>
                  <span className="mt-0.5 block text-[0.68rem] leading-snug text-muted">{account.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[0.64rem] leading-relaxed text-brand-900/70">
          Klik akun demo untuk langsung masuk • kata sandi demo <span className="font-semibold">Demo1234!</span> • 5
          mahasiswa demo + akun akademik.
        </p>
      </section>

      <div className="flex items-center gap-3 py-1" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted">
          atau masuk manual
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void doLogin(loginId, password, "manual");
        }}
      >
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="loginId" className="field-label">
              NIM / ID pengguna
            </label>
            <input
              id="loginId"
              name="loginId"
              className="field-input"
              autoComplete="username"
              inputMode="text"
              placeholder="Contoh: 20240001"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              required
              aria-invalid={Boolean(error)}
            />
          </div>

          <div>
            <label htmlFor="password" className="field-label">
              Kata sandi
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                className="field-input pr-12"
                autoComplete="current-password"
                placeholder="Kata sandi"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                aria-invalid={Boolean(error)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-brand-50 hover:text-brand-900"
                aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={pending !== null}>
          {pending === "manual" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogIn className="h-4 w-4" aria-hidden="true" />
          )}
          {pending === "manual" ? "Memeriksa sesi…" : "Masuk ke SIMPAR"}
        </Button>

        <p className="text-center text-[0.65rem] leading-relaxed text-muted">
          Sesi server-side (cookie HttpOnly). Jangan gunakan akun bersama.
        </p>
      </form>
    </div>
  );
}
