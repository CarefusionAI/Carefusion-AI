import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import type { MessageDto, ThreadSummaryDto } from '@carefusion/shared'
import { Alert, Avatar, Badge, Button, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import type { AvatarTone } from '../../components/ui'
import { errorMessage, useMarkThreadRead, useSendMessage, useThread, useThreads } from '../../api/citizen1'
import { ICONS, Icon, MutationError, Page, fmt, fmtSize, humanise, useTick, ymd } from './CitizenKit'

// Messages (CitizenMessages.dc.html): secure threads with the care team. /citizen/messages/*.

type Filter = 'All' | 'Doctors' | 'Hospitals' | 'Labs'
const FILTERS: Filter[] = ['All', 'Doctors', 'Hospitals', 'Labs']

function kindOf(t: ThreadSummaryDto): Exclude<Filter, 'All'> {
  if (t.type === 'doctor_followup') return 'Doctors'
  if (t.type === 'lab' || t.type === 'radiology' || t.type === 'pharmacist') return 'Labs'
  return 'Hospitals'
}

const TONE: Record<string, AvatarTone> = { Doctors: 'teal', Hospitals: 'blue', Labs: 'peach' }

function threadName(t: ThreadSummaryDto): string {
  return t.counterpartName ?? t.subject ?? 'Care team'
}

function threadRole(t: ThreadSummaryDto): string {
  const role = t.counterpartRole ? humanise(t.counterpartRole.replace(/_/g, ' ')) : ''
  return [role, t.subject && t.subject !== t.counterpartName ? t.subject : ''].filter(Boolean).join(' · ') || humanise(t.type)
}

function shortTime(iso: string | null, today: string): string {
  if (!iso) return ''
  return ymd(iso) === today ? fmt.time(iso) : fmt.dayMon(iso)
}

function Bubble({ m }: { m: MessageDto }) {
  return (
    <div className={clsx('c1-mmsg', m.mine && 'me')}>
      <div style={{ minWidth: 0 }}>
        <div className="c1-mbub">
          {m.text}
          {m.attachments.map((a) => (
            <div className="c1-att" key={a.id}>
              <Icon d={ICONS.doc} size={18} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{a.fileName}</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{fmtSize(a.sizeBytes)}</span>
            </div>
          ))}
        </div>
        <div className="c1-meta">{m.mine ? 'You' : (m.senderName ?? 'Care team')} · {fmt.time(m.sentAt)}</div>
      </div>
    </div>
  )
}

function Pane({ thread }: { thread: ThreadSummaryDto }) {
  const go = useNavigate()
  const detail = useThread(thread.id)
  const send = useSendMessage(thread.id)
  const [draft, setDraft] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const messages = detail.data?.messages ?? []

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages.length, thread.id])

  const days = useMemo(() => {
    const out: { day: string; items: MessageDto[] }[] = []
    for (const m of messages) {
      const d = ymd(m.sentAt)
      const lastGroup = out[out.length - 1]
      if (lastGroup && lastGroup.day === d) lastGroup.items.push(m)
      else out.push({ day: d, items: [m] })
    }
    return out
  }, [messages])

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || send.isPending) return
    send.mutate(text, { onSuccess: () => setDraft('') })
  }

  return (
    <section className="c1-pane" aria-label={threadName(thread)}>
      <div className="c1-ph2">
        <Avatar name={threadName(thread)} size={44} tone={TONE[kindOf(thread)]} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong className="c1-strong">{threadName(thread)}</strong>
          <div className="c1-muted">{threadRole(thread)}</div>
        </div>
        <Badge tone="success" dot>Encrypted</Badge>
        {kindOf(thread) !== 'Labs' ? <Button variant="secondary" size="sm" onClick={() => go('/citizen/care')}>Book visit</Button> : null}
      </div>
      <div className="c1-mlog" ref={logRef} aria-live="polite">
        {detail.isPending ? (
          <div role="status" aria-label="Loading messages"><Skeleton lines={5} height={16} /></div>
        ) : detail.isError ? (
          <Alert tone="warning" title="Could not load this conversation">{errorMessage(detail.error)}</Alert>
        ) : days.length === 0 ? (
          <EmptyState title="No messages yet">Write the first message below.</EmptyState>
        ) : (
          days.map((g) => (
            <div key={g.day} style={{ display: 'contents' }}>
              <span className="c1-day">{fmt.dateLong(`${g.day}T06:00:00Z`).replace(/ \d{4}$/, '')}</span>
              {g.items.map((m) => <Bubble key={m.id} m={m} />)}
            </div>
          ))
        )}
      </div>
      {thread.canReply ? (
        <form className="c1-mcomp" onSubmit={submit}>
          <label htmlFor="m-in" className="c1-srx">Write a message</label>
          <textarea id="m-in" rows={2} maxLength={4000} placeholder={`Write to ${threadName(thread)}…`} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <MutationError error={send.error} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="c1-muted" style={{ fontSize: 12 }}>Doctors reply within 2 working days. For emergencies call 108.</span>
            <button type="submit" className="c1-snd" disabled={!draft.trim() || send.isPending}>{send.isPending ? 'Sending…' : 'Send'}</button>
          </div>
        </form>
      ) : (
        <p className="c1-muted" style={{ margin: 16 }}>This is an announcement thread. You cannot reply to it.</p>
      )}
    </section>
  )
}

export default function CitizenMessages() {
  useTick(60_000)
  const threads = useThreads()
  const markRead = useMarkThreadRead()
  const [filter, setFilter] = useState<Filter>('All')
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const today = ymd(new Date().toISOString())

  const all = useMemo(() => threads.data ?? [], [threads.data])
  const list = all.filter((t) => {
    if (filter !== 'All' && kindOf(t) !== filter) return false
    if (q.trim() && !`${threadName(t)} ${t.subject ?? ''} ${t.lastMessagePreview ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) return false
    return true
  })
  const current = all.find((t) => t.id === selId) ?? list[0] ?? null

  function open(t: ThreadSummaryDto) {
    setSelId(t.id)
    if (t.unread > 0) markRead.mutate(t.id)
  }

  // Opening the first thread by default also marks it read.
  const firstId = current?.id
  const firstUnread = current?.unread ?? 0
  useEffect(() => {
    if (firstId && firstUnread > 0 && selId === null) markRead.mutate(firstId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstId])

  return (
    <Page label="Messages">
      <PageHeader eyebrow="Health" title="Messages" subtitle="Secure messages with your care team. Doctors reply within 2 working days — for emergencies call 108." />
      <div className="c1-lay-msg">
        <nav aria-label="Conversations">
          <div className="c1-ih">
            <div className="c1-srch">
              <Icon d={ICONS.search} size={16} />
              <label htmlFor="m-s" className="c1-srx">Search messages</label>
              <input id="m-s" placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="c1-mflt" role="group" aria-label="Filter">
              {FILTERS.map((f) => (
                <button key={f} type="button" className={clsx(filter === f && 'on')} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
          </div>
          {threads.isPending ? (
            <div role="status" aria-label="Loading conversations" style={{ padding: 18 }}><Skeleton lines={6} height={18} /></div>
          ) : threads.isError ? (
            <div style={{ padding: 18 }}>
              <Alert tone="warning" title="Could not load your messages" action={<Button variant="outline" size="sm" onClick={() => void threads.refetch()}>Try again</Button>}>
                {errorMessage(threads.error)}
              </Alert>
            </div>
          ) : list.length === 0 ? (
            <div style={{ padding: 18 }}><EmptyState title={all.length ? 'No conversations match' : 'No messages yet'}>Messages from your doctors and hospitals appear here.</EmptyState></div>
          ) : (
            list.map((t) => {
              const unread = t.id === current?.id ? 0 : t.unread
              return (
                <button key={t.id} type="button" className={clsx('c1-th', t.id === current?.id && 'on')} aria-current={t.id === current?.id ? 'true' : undefined} onClick={() => open(t)}>
                  <Avatar name={threadName(t)} size={40} tone={TONE[kindOf(t)]} />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span className="n">{threadName(t)}</span>
                      <span className="t">{shortTime(t.lastMessageAt, today)}</span>
                    </span>
                    <span className="c1-muted" style={{ fontSize: 12 }}>{threadRole(t)}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="p" style={{ flex: 1 }}>{t.lastMessagePreview ?? 'No messages yet'}</span>
                      {unread > 0 ? <span className="c1-un" aria-label={`${unread} unread`}>{unread}</span> : null}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </nav>
        {current ? (
          <Pane key={current.id} thread={current} />
        ) : (
          <section className="c1-pane" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <EmptyState title="Pick a conversation">Choose a thread on the left to read it.</EmptyState>
          </section>
        )}
      </div>
    </Page>
  )
}
