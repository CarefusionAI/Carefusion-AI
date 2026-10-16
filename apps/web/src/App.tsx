// Placeholder home page. Service URLs are the laptop ports from docs/12 section 4.1.
const SERVICES = [
  { name: 'API health', url: 'http://localhost:3000/health' },
  { name: 'AI service health', url: 'http://localhost:8000/health' },
  { name: 'AI service docs', url: 'http://localhost:8000/docs' },
  { name: 'Keycloak (login server)', url: 'http://localhost:8080' },
  { name: 'MinIO console (files)', url: 'http://localhost:9001' },
  { name: 'Mailpit (test emails and OTPs)', url: 'http://localhost:8025' },
]

export default function App() {
  return (
    <div className="min-h-screen bg-primary-50 text-primary-900">
      <div
        role="note"
        className="bg-yellow-300 py-2 text-center text-sm font-bold uppercase tracking-wide text-black"
      >
        SYNTHETIC DEMO DATA
      </div>

      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-4xl font-bold text-primary">CareFusion AI</h1>
        <p className="mt-2 text-lg text-primary-700">Monorepo skeleton — W1 Sat S2</p>

        <h2 className="mt-10 text-xl font-semibold text-primary">Service health checks</h2>
        <ul className="mt-4 space-y-2">
          {SERVICES.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md border border-primary-200 bg-white px-4 py-3 hover:border-accent"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-sm text-primary-500">{s.url}</span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
