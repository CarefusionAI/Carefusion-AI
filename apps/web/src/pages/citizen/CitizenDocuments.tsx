import { useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import type { DocType, FolderResponse } from '@carefusion/shared'
import { Alert, Badge, Button, EmptyState, Modal, Select, Skeleton, TextField } from '../../components/ui'
import type { BadgeTone } from '../../components/ui'
import { eventTag, useEvents } from '../../hooks/useEvents'
import {
  errorMessage,
  fetchDocumentDownload,
  useAllDocuments,
  useCreateFolder,
  useFolders,
  useMoveDocument,
  useRenameFolder,
  useStorageUsage,
  useUploadDocument,
} from '../../api/citizen1'
import type { CitizenDocument } from '../../api/citizen1'
import { Box, Head, ICONS, Icon, LinkBtn, MutationError, Page, fmt, fmtSize, humanise, plural } from './CitizenKit'

// Documents (CitizenDocuments.dc.html). Folders, documents, upload, download and move all use the
// citizen API (/citizen/folders, /citizen/documents/*). Synthetic demo data only.

const MAX_BYTES = 20 * 1024 * 1024
const ALL = 'all'

const TYPE_OPTIONS: { value: string; label: string; docType: DocType }[] = [
  { value: 'lab', label: 'Lab report', docType: 'lab_report' },
  { value: 'imaging', label: 'Imaging', docType: 'scan' },
  { value: 'rx', label: 'Prescription', docType: 'prescription' },
  { value: 'discharge', label: 'Discharge summary', docType: 'discharge_summary' },
  { value: 'insurance', label: 'Insurance or certificate', docType: 'certificate' },
  { value: 'other', label: 'Other', docType: 'upload' },
]

const SUGGESTIONS = ['Insurance', 'Dental', 'Pregnancy', 'Family', 'Vaccinations']

function folderTone(f: FolderResponse): string {
  switch (f.kind) {
    case 'doctor_uploads':
      return 'c-teal'
    case 'ai_chat':
    case 'image_analysis':
      return 'c-lav'
    case 'genomic_analysis':
      return 'c-blue'
    case 'temporal_analysis':
      return 'c-cream'
    default: {
      const n = f.name.toLowerCase()
      if (n.includes('lab')) return 'c-blue'
      if (n.includes('imag')) return 'c-lav'
      if (n.includes('prescr')) return 'c-teal'
      if (n.includes('discharge')) return 'c-peach'
      if (n.includes('uploaded')) return 'c-cream'
      if (n.includes('insur')) return 'c-gold'
      return 'c-sage'
    }
  }
}

function fileTag(mime: string | null): string {
  if (!mime) return 'FILE'
  if (mime.includes('pdf')) return 'PDF'
  if (mime.includes('dicom')) return 'DCM'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'JPG'
  if (mime.includes('png')) return 'PNG'
  if (mime.includes('text')) return 'TXT'
  return 'FILE'
}

type Who = 'Anyone' | 'Doctors' | 'Labs' | 'Radiology' | 'Me'

function addedBy(d: CitizenDocument): { who: Exclude<Who, 'Anyone'>; label: string; tone: BadgeTone } {
  if (d.isSelfReported) return { who: 'Me', label: 'You', tone: 'neutral' }
  if (d.docType === 'lab_report') return { who: 'Labs', label: 'Lab', tone: 'info' }
  if (d.docType === 'scan') return { who: 'Radiology', label: 'Radiology', tone: 'ai' }
  return { who: 'Doctors', label: 'Doctor', tone: 'teal' }
}

function sourceText(d: CitizenDocument): string {
  return d.isSelfReported ? 'Uploaded by you' : 'Added by your care team'
}

function isNew(d: CitizenDocument, now: number): boolean {
  return now - new Date(d.createdAt).getTime() < 3 * 86_400_000
}

function FolderModal({
  mode,
  folder,
  folders,
  onClose,
  onDone,
}: {
  mode: 'new' | 'rename' | null
  folder: FolderResponse | null
  folders: FolderResponse[]
  onClose: () => void
  onDone: (f: FolderResponse) => void
}) {
  const create = useCreateFolder()
  const rename = useRenameFolder()
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [seen, setSeen] = useState<string | null>(null)
  const key = `${mode}:${folder?.id ?? ''}`
  if (mode && seen !== key) {
    setSeen(key)
    setName(mode === 'rename' ? (folder?.name ?? '') : '')
    setErr('')
    create.reset()
    rename.reset()
  }
  const busy = create.isPending || rename.isPending

  function save() {
    const n = name.trim()
    if (!n) return setErr('Give the folder a name.')
    if (folders.some((f) => f.name.toLowerCase() === n.toLowerCase() && f.id !== folder?.id)) {
      return setErr('You already have a folder with this name.')
    }
    if (mode === 'rename' && folder) rename.mutate({ id: folder.id, name: n }, { onSuccess: onDone })
    else create.mutate(n, { onSuccess: onDone })
  }

  return (
    <Modal
      open={mode !== null}
      title={mode === 'rename' ? 'Rename folder' : 'New folder'}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>{mode === 'rename' ? 'Save name' : 'Create folder'}</Button>
        </>
      }
    >
      <div className="c1-form">
        <TextField
          label="Folder name"
          required
          value={name}
          maxLength={100}
          placeholder="e.g. Insurance, Dental, Pregnancy"
          error={err || undefined}
          onChange={(e) => {
            setName(e.target.value)
            setErr('')
          }}
        />
        {mode === 'new' ? (
          <div className="c1-sugg" role="group" aria-label="Suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="c1-chip-btn" onClick={() => setName(s)}>{s}</button>
            ))}
          </div>
        ) : null}
        <MutationError error={create.error ?? rename.error} />
      </div>
    </Modal>
  )
}

function Connected() {
  const { events } = useEvents('CITIZEN')
  const list = events.filter((e) => ['lab-result', 'imaging-result', 'prescription', 'dispensed'].includes(e.type)).slice(0, 3)
  return (
    <Box as="section" delay={90} label="New from labs and doctors">
      <div className="c1-bh">
        <h2 className="c1-bt"><span className="c1-live" aria-hidden="true" style={{ marginRight: 8 }} />New from labs &amp; doctors</h2>
        <span className="c1-muted">Added to your folders automatically</span>
      </div>
      {list.length === 0 ? (
        <span className="c1-muted">Nothing new right now. Results and prescriptions your care team adds will appear here.</span>
      ) : (
        <div className="c1-conn-l">
          {list.map((e) => {
            const tag = eventTag(e.type)
            const inner = (
              <>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className={clsx('c1-ev-f', `cf-tk-${tag.tone}`)}>{tag.tag}</span>
                  <span className="c1-muted c1-num">{e.at ? fmt.time(e.at) : ''}</span>
                </span>
                <strong>{e.title}</strong>
                <span>{e.text}</span>
                <span className="go">Open →</span>
              </>
            )
            return e.href?.startsWith('/') ? (
              <Link key={e.id} className="c1-cev" to={e.href}>{inner}</Link>
            ) : (
              <div key={e.id} className="c1-cev">{inner}</div>
            )
          })}
        </div>
      )}
    </Box>
  )
}

function UploadPanel({ folders, defaultFolder, onUploaded }: { folders: FolderResponse[]; defaultFolder: string; onUploaded: (folderId: string) => void }) {
  const upload = useUploadDocument()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [folderId, setFolderId] = useState('')
  const [type, setType] = useState('other')
  const [over, setOver] = useState(false)
  const [fileError, setFileError] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const userFolders = folders
  const target = folderId || (userFolders.some((f) => f.id === defaultFolder) ? defaultFolder : (userFolders[0]?.id ?? ''))

  function pick(f: File | null) {
    setDone(null)
    setFileError('')
    if (!f) return
    if (f.size > MAX_BYTES) {
      setFileError('That file is over 20 MB. Choose a smaller one.')
      return
    }
    setFile(f)
    setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    pick(e.dataTransfer.files?.[0] ?? null)
  }

  function submit() {
    if (!file || !title.trim() || !target) return
    const docType = TYPE_OPTIONS.find((t) => t.value === type)?.docType ?? 'upload'
    upload.mutate(
      { file, title: title.trim(), folderId: target, docType },
      {
        onSuccess: () => {
          setDone(title.trim())
          setFile(null)
          setTitle('')
          if (fileInput.current) fileInput.current.value = ''
          onUploaded(target)
        },
      },
    )
  }

  const folderName = folders.find((f) => f.id === target)?.name ?? 'folder'
  return (
    <Box title="Upload a document" label="Upload a document">
      <div
        className={clsx('c1-drop', over && 'is-over')}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <span className="c1-up" aria-hidden="true"><Icon d={ICONS.upload} size={24} /></span>
        <strong className="c1-strong">{file ? `File ready: ${file.name}` : 'Drop a file here'}</strong>
        <span className="c1-muted">PDF, JPG or PNG · up to 20 MB</span>
        <label className="c1-pick">
          Choose file
          <input ref={fileInput} className="c1-srx" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {fileError ? <Alert tone="danger" title="File not accepted">{fileError}</Alert> : null}
      <TextField label="Document name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Eye test, Vasan Eye Care" disabled={!file} maxLength={200} />
      <Select
        label="Save to folder"
        options={userFolders.map((f) => ({ value: f.id, label: f.name }))}
        value={target}
        onChange={setFolderId}
        helper="Pick any folder, including ones you made."
      />
      <Select label="Type" options={TYPE_OPTIONS.map((t) => ({ value: t.value, label: t.label }))} value={type} onChange={setType} />
      <MutationError error={upload.error} />
      {done ? <div className="c1-note" role="status">Uploaded “{done}”.</div> : null}
      <Button variant="primary" fullWidth loading={upload.isPending} disabled={!file || !title.trim() || !target} onClick={submit}>
        {upload.isPending ? 'Uploading' : `Upload to ${folderName}`}
      </Button>
    </Box>
  )
}

function Selected({ doc, folders }: { doc: CitizenDocument | null; folders: FolderResponse[] }) {
  const go = useNavigate()
  const move = useMoveDocument()
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState('')
  if (!doc) {
    return (
      <Box title="Selected">
        <EmptyState title="Nothing selected">Choose a document to see its details.</EmptyState>
      </Box>
    )
  }
  const by = addedBy(doc)
  const folder = folders.find((f) => f.id === doc.folderId)

  async function open() {
    if (!doc) return
    setOpening(true)
    setOpenError('')
    try {
      const res = await fetchDocumentDownload(doc.id)
      window.open(res.url, '_blank', 'noopener')
    } catch (e) {
      setOpenError(errorMessage(e, 'Could not open the document.'))
    } finally {
      setOpening(false)
    }
  }

  return (
    <Box title="Selected" actions={<Badge tone={by.tone}>{by.label}</Badge>}>
      <strong className="c1-strong" style={{ fontSize: 18, overflowWrap: 'anywhere' }}>{doc.title}</strong>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 14 }}>
        <dt className="c1-muted">Folder</dt><dd style={{ margin: 0 }}>{folder?.name ?? '-'}</dd>
        <dt className="c1-muted">Source</dt><dd style={{ margin: 0 }}>{sourceText(doc)}</dd>
        <dt className="c1-muted">Type</dt><dd style={{ margin: 0 }}>{humanise(doc.docType)}</dd>
        <dt className="c1-muted">Date</dt><dd style={{ margin: 0 }}>{fmt.date(doc.createdAt)}</dd>
        <dt className="c1-muted">Size</dt><dd style={{ margin: 0 }}>{fmtSize(doc.sizeBytes)}</dd>
        <dt className="c1-muted">Verified</dt><dd style={{ margin: 0 }}>{doc.isSelfReported ? 'Not verified (self-reported)' : 'Added by a verified source'}</dd>
        <dt className="c1-muted">Shared</dt><dd style={{ margin: 0 }}>With doctors you give a key to</dd>
      </dl>
      <Select
        label="Move to folder"
        options={folders.map((f) => ({ value: f.id, label: f.name }))}
        value={doc.folderId}
        onChange={(v) => v !== doc.folderId && move.mutate({ id: doc.id, toFolderId: v })}
        disabled={move.isPending}
      />
      <MutationError error={move.error} />
      {openError ? <Alert tone="danger" title="Could not open">{openError}</Alert> : null}
      <div className="c1-flt">
        <Button variant="primary" size="sm" loading={opening} onClick={() => void open()}>Open</Button>
        <Button variant="outline" size="sm" onClick={() => void open()}>Download</Button>
        <Button variant="ai" size="sm" onClick={() => go('/citizen/ai-chat')}>Ask AI about it</Button>
      </div>
    </Box>
  )
}

export default function CitizenDocuments() {
  const foldersQ = useFolders()
  const folders = useMemo(() => foldersQ.data ?? [], [foldersQ.data])
  const withDocs = useMemo(() => folders.filter((f) => f.documentCount > 0).map((f) => f.id), [folders])
  const docsQ = useAllDocuments(withDocs)
  const storage = useStorageUsage()
  const move = useMoveDocument()

  const [tab, setTab] = useState(ALL)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [q, setQ] = useState('')
  const [who, setWho] = useState<Who>('Anyone')
  const [selId, setSelId] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [fm, setFm] = useState<{ mode: 'new' | 'rename'; folder: FolderResponse | null } | null>(null)
  const uploadRef = useRef<HTMLDivElement>(null)

  const docs = useMemo(() => [...(docsQ.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [docsQ.data])
  const list = docs.filter((d) => {
    if (tab !== ALL && d.folderId !== tab) return false
    if (q.trim() && !`${d.title} ${humanise(d.docType)}`.toLowerCase().includes(q.trim().toLowerCase())) return false
    if (who !== 'Anyone' && addedBy(d).who !== who) return false
    return true
  })
  const sel = docs.find((d) => d.id === selId) ?? list[0] ?? null
  const now = docs.length ? Math.max(...docs.map((d) => new Date(d.createdAt).getTime())) : 0
  const folderById = new Map(folders.map((f) => [f.id, f]))
  const curName = tab === ALL ? 'All documents' : (folderById.get(tab)?.name ?? 'All documents')
  const loadingAll = foldersQ.isPending || (withDocs.length > 0 && docsQ.isPending)
  const totalDocs = folders.reduce((n, f) => n + f.documentCount, 0)
  const selfCount = docs.filter((d) => d.isSelfReported).length

  function moveDoc(id: string, toFolderId: string) {
    setMenu(null)
    setDropOn(null)
    move.mutate({ id, toFolderId })
  }

  return (
    <Page label="Documents">
      <Head
        eyebrow="Documents"
        title="All your records, in one place"
        sub={foldersQ.data ? `${plural(totalDocs, 'document')} in ${plural(folders.length, 'folder')} · ${selfCount} uploaded by you` : 'Loading your folders'}
        actions={
          <>
            <Badge tone="success" dot>Encrypted</Badge>
            <Button variant="secondary" icon={<Icon d={ICONS.folderAdd} size={18} />} onClick={() => setFm({ mode: 'new', folder: null })}>New folder</Button>
            <Button variant="primary" icon={<Icon d={ICONS.upload} size={18} />} onClick={() => uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Upload document</Button>
          </>
        }
      />

      <Box as="section" delay={60} label="Folders" title="Folders" actions={<span className="c1-muted">Drag a document onto a folder, or use “Move to”</span>}>
        {foldersQ.isPending ? (
          <div className="c1-frail" role="status" aria-label="Loading folders">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={92} radius={16} />)}</div>
        ) : foldersQ.isError ? (
          <Alert tone="warning" title="Could not load your folders">{errorMessage(foldersQ.error)}</Alert>
        ) : (
          <div className="c1-frail" role="list">
            {[{ id: ALL, name: 'All documents', kind: 'all', documentCount: totalDocs } as unknown as FolderResponse, ...folders].map((f) => {
              const on = tab === f.id
              const tone = f.id === ALL ? 'c-all' : folderTone(f)
              const renamable = f.id !== ALL && f.kind === 'user'
              return (
                <div className="c1-fwrap" role="listitem" key={f.id}>
                  <button
                    type="button"
                    className={clsx('c1-fold', on && 'is-sel', dropOn === f.id && 'is-drop')}
                    aria-pressed={on}
                    onClick={() => {
                      setTab(f.id)
                      setMenu(null)
                    }}
                    onDragOver={(e) => {
                      if (f.id === ALL) return
                      e.preventDefault()
                      if (dropOn !== f.id) setDropOn(f.id)
                    }}
                    onDragLeave={() => setDropOn((d) => (d === f.id ? null : d))}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (f.id !== ALL && dragId) moveDoc(dragId, f.id)
                    }}
                  >
                    <span className={clsx('c1-fd-ic', tone)} aria-hidden="true"><Icon d={ICONS.folder} /></span>
                    <span className="c1-fname">{f.name}</span>
                    <span className="c1-muted">{plural(f.documentCount, 'file')}</span>
                  </button>
                  {renamable ? (
                    <span style={{ display: 'flex', paddingLeft: 4 }}>
                      <LinkBtn ariaLabel={`Rename folder ${f.name}`} onClick={() => setFm({ mode: 'rename', folder: f })}>Rename</LinkBtn>
                    </span>
                  ) : null}
                </div>
              )
            })}
            <button type="button" className="c1-fold c1-fnew" onClick={() => setFm({ mode: 'new', folder: null })}>
              <span className="c1-fd-ic c-new" aria-hidden="true">+</span>
              <span className="c1-fname">New folder</span>
              <span className="c1-muted">Group your own files</span>
            </button>
          </div>
        )}
      </Box>

      <Connected />

      <div className="c1-lay-doc c1-in" style={{ animationDelay: '120ms' }}>
        <div className="c1-stack">
          <Box>
            <div className="c1-bh">
              <div>
                <h2 className="c1-bt">{curName}</h2>
                <span className="c1-muted">{list.length} of {docs.length} shown</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="View">
                <button type="button" className={clsx('c1-vw', view === 'grid' && 'is-on')} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Grid</button>
                <button type="button" className={clsx('c1-vw', view === 'list' && 'is-on')} aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
              </div>
            </div>
            <div className="c1-tools">
              <TextField label="Search documents" type="search" placeholder="Try “HbA1c” or “Lipid”" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select label="Added by" options={['Anyone', 'Doctors', 'Labs', 'Radiology', 'Me']} value={who} onChange={(v) => setWho(v as Who)} />
            </div>
            {loadingAll ? (
              <div role="status" aria-label="Loading documents" className="c1-dgrid">{[0, 1, 2].map((i) => <Skeleton key={i} height={170} radius={18} />)}</div>
            ) : docsQ.isError ? (
              <Alert tone="warning" title="Could not load your documents">{errorMessage(docsQ.error)}</Alert>
            ) : list.length === 0 ? (
              <EmptyState title={q.trim() ? `Nothing matches “${q}”` : 'This folder is empty'}>
                Upload a file and choose this folder, or move documents here with “Move to”.
              </EmptyState>
            ) : view === 'grid' ? (
              <div className="c1-dgrid">
                {list.map((d) => {
                  const f = folderById.get(d.folderId)
                  const tone = f ? folderTone(f) : 'c-cream'
                  const by = addedBy(d)
                  const open = menu === d.id
                  return (
                    <div key={d.id} className={clsx('c1-doc', d.id === sel?.id && 'is-sel')} draggable onDragStart={() => setDragId(d.id)} onDragEnd={() => setDragId(null)}>
                      <button type="button" className="c1-dhit" aria-label={`${d.title}, ${fmt.date(d.createdAt)}`} onClick={() => { setSelId(d.id); setMenu(null) }}>
                        <span className={clsx('c1-thumb', d.docType === 'scan' ? 'img' : tone)} aria-hidden="true">
                          <span className="ln l1" /><span className="ln l2" /><span className="ln l3" />
                          <span className="ft">{fileTag(d.mimeType)}</span>
                        </span>
                        <span className="c1-dn">{d.title}</span>
                        <span className="c1-muted">{sourceText(d)} · {fmt.date(d.createdAt)}</span>
                      </button>
                      <span className="c1-dfoot">
                        <span className="c1-dbad">
                          <Badge tone={by.tone}>{by.label}</Badge>
                          {isNew(d, now) ? <Badge tone="gold">New</Badge> : null}
                        </span>
                        <button type="button" className="c1-lk" aria-expanded={open} onClick={() => setMenu(open ? null : d.id)}>Move to…</button>
                      </span>
                      {open ? (
                        <span className="c1-mmenu" role="group" aria-label={`Move ${d.title} to`}>
                          {folders.filter((x) => x.id !== d.folderId).map((x) => (
                            <button key={x.id} type="button" className="c1-mopt" onClick={() => moveDoc(d.id, x.id)}>
                              <span className={clsx('c1-dot', folderTone(x))} aria-hidden="true" />{x.name}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div>
                {list.map((d) => {
                  const f = folderById.get(d.folderId)
                  const by = addedBy(d)
                  return (
                    <div className="c1-row" key={d.id} style={{ padding: '12px 0' }}>
                      <span className={clsx('c1-thumb sm', d.docType === 'scan' ? 'img' : f ? folderTone(f) : 'c-cream')} aria-hidden="true"><span className="ft">{fileTag(d.mimeType)}</span></span>
                      <div className="c1-grow">
                        <strong className="c1-strong" style={{ fontSize: 14 }}>{d.title}</strong>
                        <div className="c1-muted">{f?.name} · {sourceText(d)} · {fmt.date(d.createdAt)}</div>
                      </div>
                      <Badge tone={by.tone}>{by.label}</Badge>
                      <LinkBtn onClick={() => setSelId(d.id)}>Open</LinkBtn>
                    </div>
                  )
                })}
              </div>
            )}
            <MutationError error={move.error} />
          </Box>
        </div>

        <aside className="c1-stack">
          <div ref={uploadRef}>
            <UploadPanel
              folders={folders}
              defaultFolder={tab === ALL ? (folders.find((f) => f.name.toLowerCase().includes('uploaded'))?.id ?? '') : tab}
              onUploaded={(id) => setTab(id)}
            />
          </div>
          <Selected doc={sel} folders={folders} />
          <Box title="Storage" actions={<span className="c1-muted">{storage.data ? `${fmtSize(storage.data.bytes)} of 1 GB` : ''}</span>}>
            {storage.isPending ? (
              <Skeleton height={8} radius={9999} />
            ) : storage.data ? (
              <>
                <div className="c1-store" role="img" aria-label={`${fmtSize(storage.data.bytes)} used of 1 GB`}>
                  <i style={{ width: `${Math.max(2, Math.min(100, (storage.data.bytes / 1024 ** 3) * 100))}%` }} />
                </div>
                <span className="c1-muted">{plural(storage.data.documents, 'document')} stored</span>
              </>
            ) : (
              <span className="c1-muted">Storage is not available right now.</span>
            )}
          </Box>
        </aside>
      </div>

      <FolderModal
        mode={fm?.mode ?? null}
        folder={fm?.folder ?? null}
        folders={folders}
        onClose={() => setFm(null)}
        onDone={(f) => {
          setFm(null)
          setTab(f.id)
        }}
      />
    </Page>
  )
}
