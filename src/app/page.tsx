export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-24">
      <h1 className="text-5xl font-bold tracking-tight">Aircade</h1>
      <p className="mt-4 text-lg text-brand-coffee/70">群友造的街机厅</p>
      <button
        type="button"
        className="mt-10 rounded-btn bg-brand-orange px-6 py-3 text-white shadow-sm transition hover:bg-brand-orange/90"
      >
        脚手架已就绪
      </button>
    </main>
  );
}
