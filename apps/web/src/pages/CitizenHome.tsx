import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiFetch, apiJson } from '../lib/api'
import { useAuth } from '../context/AuthContext'

// Citizen home: Profile and Documents tabs (docs/07). Synthetic demo data only.

interface CitizenProfile {
  person: {
    id: string
    fullName: string
    dateOfBirth: string
    sex: string
    aadhaarToken: string | null
    abhaNumber: string | null
    abhaAddress: string | null
    kycStatus: string
    faceCheckStatus: string
    identityLocked: boolean
    photoKey: string | null
  }
  profile: {
    preferredLanguage: string
    bloodGroup: string
    organDonorStatus: string
    aiResearchOptIn: boolean
    district: { id: string; name: string } | null
    state: { id: string; name: string } | null
  }
  specialCategories: Array<{
    id: string
    categoryCode: string
    categoryName: string
    otherText: string | null
    status: string
  }>
  emergencyContacts: Array<{
    id: string
    contactPersonId: string
    contactName: string
    relation: string
    priority: number
  }>
}

interface Folder {
  id: string
  name: string
  kind: string
  parentFolderId: string | null
  documentCount: number
  createdAt: string
}

interface CitizenDocument {
  id: string
  title: string
  docType: string
  mimeType: string | null
  sizeBytes: number | null
  isSelfReported: boolean
  createdAt: string
}

interface SpecialCategoryType {
  code: string
  name: string
}

type Tab = 'profile' | 'documents'

const btnPrimary =
  'rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50'
const btnGhost =
  'rounded-md border border-primary-200 bg-white px-4 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 disabled:opacity-50'
const btnSmall =
  'rounded-md border border-primary-200 bg-white px-2.5 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-50 disabled:opacity-50'
const inputCls =
  'mt-1 block w-full rounded-md border border-primary-200 bg-white px-3 py-2 text-sm text-primary-900 focus:border-primary focus:outline-none'

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'hi', label: 'Hindi' },
]
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']
const CATEGORY_STATUSES = ['untreated', 'in progress', 'treated']

const FOLDER_ICONS: Record<string, string> = {
  doctor_uploads: '🗂️',
  ai_chat: '💬',
  image_analysis: '🖼️',
  genomic_analysis: '🧬',
  temporal_analysis: '⏳',
  user: '📁',
}

function humanise(value: string): string {
  const text = value.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '-'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Show only the first and last parts of a demo token, e.g. DEMO-****-4502.
function maskToken(token: string | null): string {
  if (!token) return '-'
  const parts = token.split('-')
  if (parts.length < 3) return `****${token.slice(-4)}`
  return [parts[0], '****', parts[parts.length - 1]].join('-')
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

async function failureMessage(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string | string[]; errorMessage?: string }
  const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message
  return data.errorMessage ?? msg ?? `Request failed (${res.status})`
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-primary-500" role="status">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  )
}

function Badge({ tone, children }: { tone: 'green' | 'yellow' | 'grey'; children: string }) {
  const cls =
    tone === 'green'
      ? 'bg-green-100 text-green-700'
      : tone === 'yellow'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-primary-50 text-primary-700'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
}

function verifiedBadge(status: string, label: string) {
  const ok = ['verified', 'passed', 'success', 'approved'].includes(status.toLowerCase())
  return <Badge tone={ok ? 'green' : 'yellow'}>{ok ? `${label}: Verified` : `${label}: ${humanise(status)}`}</Badge>
}

function categoryTone(status: string): 'green' | 'yellow' | 'grey' {
  const s = status.toLowerCase()
  if (s === 'treated') return 'green'
  if (s === 'untreated') return 'yellow'
  return 'grey'
}

function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="rounded-lg border border-primary-100 bg-white shadow-sm">
      <div className="border-b border-primary-100 px-4 py-3">
        <h2 className="text-base font-semibold text-primary">{title}</h2>
        {note && <p className="text-xs text-primary-400">{note}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-primary-400">{label}</dt>
      <dd className="break-words text-sm text-primary-900">{value}</dd>
    </div>
  )
}

// ---------------------------------------------------------------- Profile tab

function ProfileTab() {
  const [data, setData] = useState<CitizenProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [language, setLanguage] = useState('en')
  const [bloodGroup, setBloodGroup] = useState('unknown')
  const [optIn, setOptIn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [types, setTypes] = useState<SpecialCategoryType[]>([])
  const [newCode, setNewCode] = useState('')
  const [newStatus, setNewStatus] = useState(CATEGORY_STATUSES[0])
  const [newOther, setNewOther] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  const [catError, setCatError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const p = await apiJson<CitizenProfile>('/v1/citizen/profile')
      setData(p)
      setLanguage(p.profile.preferredLanguage)
      setBloodGroup(p.profile.bloodGroup)
      setOptIn(p.profile.aiResearchOptIn)
    } catch (e) {
      setError(errorText(e, 'Could not load your profile'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    apiJson<SpecialCategoryType[]>('/v1/citizen/special-categories/types')
      .then((t) => {
        setTypes(t)
        setNewCode((current) => current || t[0]?.code || '')
      })
      .catch(() => setTypes([]))
  }, [load])

  async function saveProfile(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await apiFetch('/v1/citizen/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: language, bloodGroup, aiResearchOptIn: optIn }),
      })
      if (!res.ok) {
        setSaveMsg({ ok: false, text: await failureMessage(res) })
        return
      }
      setSaveMsg({ ok: true, text: 'Profile saved.' })
      await load()
    } catch (err) {
      setSaveMsg({ ok: false, text: errorText(err, 'Could not save profile') })
    } finally {
      setSaving(false)
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault()
    if (!newCode) return
    if (newCode === 'other' && !newOther.trim()) {
      setCatError('Please describe the category.')
      return
    }
    setCatBusy(true)
    setCatError(null)
    try {
      const res = await apiFetch('/v1/citizen/special-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryCode: newCode,
          status: newStatus,
          otherText: newCode === 'other' ? newOther.trim() : undefined,
        }),
      })
      if (!res.ok) {
        setCatError(await failureMessage(res))
        return
      }
      setNewOther('')
      await load()
    } catch (err) {
      setCatError(errorText(err, 'Could not add category'))
    } finally {
      setCatBusy(false)
    }
  }

  async function endCategory(id: string) {
    setCatBusy(true)
    setCatError(null)
    try {
      const res = await apiFetch(`/v1/citizen/special-categories/${id}/end`, { method: 'POST' })
      if (!res.ok) {
        setCatError(await failureMessage(res))
        return
      }
      await load()
    } catch (err) {
      setCatError(errorText(err, 'Could not end category'))
    } finally {
      setCatBusy(false)
    }
  }

  if (loading) return <Spinner label="Loading profile..." />
  if (error) return <ErrorBox message={error} />
  if (!data) return null

  const { person, specialCategories, emergencyContacts } = data
  const contacts = [...emergencyContacts].sort((a, b) => a.priority - b.priority)

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-primary-100 bg-white shadow-sm">
        <div className="bg-primary px-4 py-3 text-primary-foreground">
          <p className="text-xs uppercase tracking-wide text-primary-100">Identity</p>
          <h2 className="text-xl font-bold">{person.fullName}</h2>
        </div>
        <div className="space-y-4 p-4">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Date of birth" value={formatDate(person.dateOfBirth)} />
            <Field label="Sex" value={humanise(person.sex)} />
            <Field label="Aadhaar token (masked)" value={maskToken(person.aadhaarToken)} />
            <Field label="ABHA number" value={person.abhaNumber ?? '-'} />
            <Field label="ABHA address" value={person.abhaAddress ?? '-'} />
            <Field
              label="Location"
              value={[data.profile.district?.name, data.profile.state?.name].filter(Boolean).join(', ') || '-'}
            />
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            {verifiedBadge(person.kycStatus, 'KYC')}
            {verifiedBadge(person.faceCheckStatus, 'Face check')}
            {person.identityLocked && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-600">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path
                    fillRule="evenodd"
                    d="M10 2a4 4 0 00-4 4v2H5a1 1 0 00-1 1v7a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-1V6a4 4 0 00-4-4zm2 6V6a2 2 0 10-4 0v2h4z"
                    clipRule="evenodd"
                  />
                </svg>
                Identity verified - locked fields
              </span>
            )}
          </div>
        </div>
      </section>

      <Card title="Editable profile">
        <form onSubmit={(e) => void saveProfile(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-primary-700">
              Preferred language
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-primary-700">
              Blood group
              <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} className={inputCls}>
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g === 'unknown' ? 'Unknown' : g}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm text-primary-700">
            <input
              type="checkbox"
              checked={optIn}
              onChange={(e) => setOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-primary-300 accent-primary"
            />
            <span>
              AI research opt-in
              <span className="block text-xs text-primary-400">
                Allow de-identified data to be used in research (demo setting, simulated AI output only).
              </span>
            </span>
          </label>
          {saveMsg &&
            (saveMsg.ok ? (
              <p role="status" className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-600">
                {saveMsg.text}
              </p>
            ) : (
              <ErrorBox message={saveMsg.text} />
            ))}
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </Card>

      <Card title="Special categories" note="Conditions or situations that help doctors care for you.">
        <div className="space-y-4">
          {catError && <ErrorBox message={catError} />}
          {specialCategories.length === 0 ? (
            <p className="text-sm text-primary-500">No active special categories.</p>
          ) : (
            <ul className="divide-y divide-primary-100 rounded-md border border-primary-100">
              {specialCategories.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-primary-900">
                      {c.categoryName}
                      {c.otherText ? ` (${c.otherText})` : ''}
                    </span>
                    <Badge tone={categoryTone(c.status)}>{humanise(c.status)}</Badge>
                  </div>
                  <button type="button" className={btnSmall} disabled={catBusy} onClick={() => void endCategory(c.id)}>
                    End
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(e) => void addCategory(e)}
            className="space-y-3 rounded-md border border-primary-100 bg-primary-50 p-3"
          >
            <p className="text-sm font-semibold text-primary-700">Add category</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-primary-700">
                Category
                <select value={newCode} onChange={(e) => setNewCode(e.target.value)} className={inputCls}>
                  {types.length === 0 && <option value="">No categories available</option>}
                  {types.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-primary-700">
                Status
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className={inputCls}>
                  {CATEGORY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanise(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {newCode === 'other' && (
              <label className="block text-sm font-medium text-primary-700">
                Please describe
                <input
                  type="text"
                  value={newOther}
                  maxLength={200}
                  onChange={(e) => setNewOther(e.target.value)}
                  className={inputCls}
                />
              </label>
            )}
            <button type="submit" className={btnPrimary} disabled={catBusy || !newCode}>
              {catBusy ? 'Saving...' : 'Add category'}
            </button>
          </form>
        </div>
      </Card>

      <Card title="Emergency contacts" note="Editing contacts will be available in a later release.">
        {contacts.length === 0 ? (
          <p className="text-sm text-primary-500">No emergency contacts yet.</p>
        ) : (
          <ul className="divide-y divide-primary-100 rounded-md border border-primary-100">
            {contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-primary-900">{c.contactName}</p>
                  <p className="text-xs text-primary-500">{humanise(c.relation)}</p>
                </div>
                <Badge tone="grey">{`Priority ${c.priority}`}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

// -------------------------------------------------------------- Documents tab

function DocumentsTab() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [docs, setDocs] = useState<CitizenDocument[]>([])
  const [loadingFolders, setLoadingFolders] = useState(true)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [newFolder, setNewFolder] = useState<string | null>(null)
  const [folderBusy, setFolderBusy] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)

  const [movingId, setMovingId] = useState<string | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [busyDoc, setBusyDoc] = useState<string | null>(null)

  const loadFolders = useCallback(async () => {
    try {
      const list = await apiJson<Folder[]>('/v1/citizen/folders')
      setFolders(list)
      setSelectedId((current) => (current && list.some((f) => f.id === current) ? current : (list[0]?.id ?? null)))
    } catch (e) {
      setError(errorText(e, 'Could not load folders'))
    } finally {
      setLoadingFolders(false)
    }
  }, [])

  const loadDocs = useCallback(async (folderId: string) => {
    setLoadingDocs(true)
    try {
      setDocs(await apiJson<CitizenDocument[]>(`/v1/citizen/folders/${folderId}/documents`))
    } catch (e) {
      setError(errorText(e, 'Could not load documents'))
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  useEffect(() => {
    setMovingId(null)
    if (selectedId) void loadDocs(selectedId)
    else setDocs([])
  }, [selectedId, loadDocs])

  async function createFolder(e: FormEvent) {
    e.preventDefault()
    if (!newFolder?.trim()) return
    setFolderBusy(true)
    setError(null)
    try {
      const res = await apiFetch('/v1/citizen/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolder.trim() }),
      })
      if (!res.ok) {
        setError(await failureMessage(res))
        return
      }
      setNewFolder(null)
      await loadFolders()
    } catch (err) {
      setError(errorText(err, 'Could not create folder'))
    } finally {
      setFolderBusy(false)
    }
  }

  function pickFile(f: File | null) {
    setFile(f)
    if (f) setTitle(f.name.replace(/\.[^.]+$/, ''))
    else setTitle('')
  }

  async function upload(e: FormEvent) {
    e.preventDefault()
    if (!file || !selectedId || !title.trim()) return
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('title', title.trim())
      form.append('folderId', selectedId)
      form.append('docType', 'upload')
      // No Content-Type header: the browser adds the multipart boundary.
      const res = await apiFetch('/v1/citizen/documents/upload', { method: 'POST', body: form })
      if (!res.ok) {
        setError(await failureMessage(res))
        return
      }
      setNotice('Document uploaded.')
      pickFile(null)
      await Promise.all([loadDocs(selectedId), loadFolders()])
    } catch (err) {
      setError(errorText(err, 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  async function download(id: string) {
    setBusyDoc(id)
    setError(null)
    try {
      const res = await apiJson<{ url: string }>(`/v1/citizen/documents/${id}/download`)
      window.open(res.url, '_blank', 'noopener')
    } catch (err) {
      setError(errorText(err, 'Could not download document'))
    } finally {
      setBusyDoc(null)
    }
  }

  async function move(id: string) {
    if (!moveTo || !selectedId) return
    setBusyDoc(id)
    setError(null)
    try {
      const res = await apiFetch(`/v1/citizen/documents/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toFolderId: moveTo }),
      })
      if (!res.ok) {
        setError(await failureMessage(res))
        return
      }
      setMovingId(null)
      setNotice('Document moved.')
      await Promise.all([loadDocs(selectedId), loadFolders()])
    } catch (err) {
      setError(errorText(err, 'Could not move document'))
    } finally {
      setBusyDoc(null)
    }
  }

  if (loadingFolders) return <Spinner label="Loading folders..." />

  const selected = folders.find((f) => f.id === selectedId) ?? null
  const moveTargets = folders.filter((f) => f.id !== selectedId)

  return (
    <div className="space-y-4">
      {error && <ErrorBox message={error} />}
      {notice && (
        <p role="status" className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-sm text-accent-600">
          {notice}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[16rem_1fr]">
        <aside className="space-y-2" aria-label="Folders">
          <ul className="space-y-1">
            {folders.map((f) => {
              const active = f.id === selectedId
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(f.id)
                      setNotice(null)
                    }}
                    aria-current={active ? 'true' : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                      active
                        ? 'border-primary bg-primary-50 font-semibold text-primary'
                        : 'border-primary-100 bg-white text-primary-700 hover:bg-primary-50'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true">{FOLDER_ICONS[f.kind] ?? FOLDER_ICONS.user}</span>
                      <span className="truncate">{f.name}</span>
                    </span>
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700">
                      {f.documentCount}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {newFolder === null ? (
            <button type="button" className={`${btnGhost} w-full`} onClick={() => setNewFolder('')}>
              New folder
            </button>
          ) : (
            <form onSubmit={(e) => void createFolder(e)} className="space-y-2 rounded-md border border-primary-100 bg-primary-50 p-2">
              <input
                type="text"
                autoFocus
                value={newFolder}
                maxLength={100}
                placeholder="Folder name"
                aria-label="Folder name"
                onChange={(e) => setNewFolder(e.target.value)}
                className={inputCls}
              />
              <div className="flex gap-2">
                <button type="submit" className={btnPrimary} disabled={folderBusy || !newFolder.trim()}>
                  Create
                </button>
                <button type="button" className={btnGhost} disabled={folderBusy} onClick={() => setNewFolder(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </aside>

        <div className="space-y-4">
          {!selected ? (
            <p className="rounded-lg border border-primary-100 bg-white p-6 text-center text-sm text-primary-500">
              No folders yet.
            </p>
          ) : (
            <>
              <Card title={`${FOLDER_ICONS[selected.kind] ?? FOLDER_ICONS.user} ${selected.name}`}>
                <form onSubmit={(e) => void upload(e)} className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-primary-700">
                      File
                      <input
                        key={file ? 'has-file' : 'no-file'}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
                        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                        className="mt-1 block w-full text-sm text-primary-700 file:mr-3 file:rounded-md file:border file:border-primary-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-700"
                      />
                    </label>
                    <label className="block text-sm font-medium text-primary-700">
                      Title
                      <input
                        type="text"
                        value={title}
                        maxLength={200}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={!file}
                        className={inputCls}
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="submit" className={btnPrimary} disabled={!file || !title.trim() || uploading}>
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                    {uploading && <Spinner label="Uploading file..." />}
                  </div>
                </form>
              </Card>

              {loadingDocs ? (
                <Spinner label="Loading documents..." />
              ) : docs.length === 0 ? (
                <p className="rounded-lg border border-primary-100 bg-white p-6 text-center text-sm text-primary-500">
                  No documents in this folder.
                </p>
              ) : (
                <ul className="space-y-2">
                  {docs.map((d) => (
                    <li key={d.id} className="space-y-2 rounded-lg border border-primary-100 bg-white p-3 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-primary-900">{d.title}</p>
                          <p className="text-xs text-primary-500">
                            {formatSize(d.sizeBytes)} · {formatDate(d.createdAt)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="grey">{humanise(d.docType)}</Badge>
                          {d.isSelfReported && <Badge tone="yellow">Self-reported</Badge>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={btnSmall} disabled={busyDoc === d.id} onClick={() => void download(d.id)}>
                          Download
                        </button>
                        <button
                          type="button"
                          className={btnSmall}
                          disabled={busyDoc === d.id || moveTargets.length === 0}
                          onClick={() => {
                            setMovingId(movingId === d.id ? null : d.id)
                            setMoveTo(moveTargets[0]?.id ?? '')
                          }}
                        >
                          Move
                        </button>
                      </div>
                      {movingId === d.id && (
                        <div className="flex flex-wrap items-end gap-2 rounded-md border border-primary-100 bg-primary-50 p-2">
                          <label className="block text-xs font-medium text-primary-700">
                            Move to folder
                            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={inputCls}>
                              {moveTargets.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button type="button" className={btnPrimary} disabled={!moveTo || busyDoc === d.id} onClick={() => void move(d.id)}>
                            Move
                          </button>
                          <button type="button" className={btnGhost} onClick={() => setMovingId(null)}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------- Page

export default function CitizenHome() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')

  if (!user?.personId) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-primary-200 bg-white p-6 text-center shadow-sm">
        <p className="font-semibold text-primary">Log in as Citizen to view your profile</p>
        <p className="mt-1 text-sm text-primary-500">
          Pick the Citizen role on the role selector. The demo needs the API running to look up your demo identity.
        </p>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'documents', label: 'Documents' },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">My Health Profile</h1>
        <p className="text-sm text-primary-500">Your identity, health preferences and documents (synthetic demo data).</p>
      </header>

      <div className="flex border-b border-primary-200" role="tablist">
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium ${
                active ? 'border-b-2 border-primary text-primary' : 'text-primary-400 hover:text-primary-600'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'profile' ? <ProfileTab /> : <DocumentsTab />}
    </div>
  )
}
