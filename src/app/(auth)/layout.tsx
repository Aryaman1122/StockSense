export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="text-xl font-semibold tracking-tight">StockFlow</span>
        </div>
        <div className="rounded-xl border border-b1 bg-s0 p-6">{children}</div>
      </div>
    </main>
  );
}
