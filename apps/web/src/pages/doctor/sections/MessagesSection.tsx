import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Avatar, Button } from '../../../components/ui'
import { useReplyMessage, useThread, useThreads } from '../../../api/doctor'
import { Box, ErrorNote, Header, Loading } from '../parts'
import { fmtDayTime } from '../format'

export default function MessagesSection() {
  const threads = useThreads()
  const [pick, setPick] = useState<string | null>(null)
  const selected = pick ?? threads.data?.threads[0]?.id ?? null
  const thread = useThread(selected)
  const reply = useReplyMessage()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [thread.data?.messages.length])

  function send(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!selected || !t) return
    reply.mutate({ id: selected, text: t }, { onSuccess: () => setText('') })
  }

  if (threads.isLoading) return <Loading lines={6} />
  if (threads.isError || !threads.data) return <ErrorNote error={threads.error} title="Could not load messages" />
  const info = threads.data.threads.find((t) => t.id === selected)

  return (
    <div className="dr-page">
      <Header title="Messages" subtitle="Patients can message you after a visit. Replies appear in their Messages section." />
      <section className="dr-msgs">
        <Box title="Threads" actions={<span className="dr-muted">{threads.data.unreadTotal} unread</span>}>
          <div className="dr-stack" style={{ gap: 6 }}>
            {threads.data.threads.length === 0 ? <p className="dr-muted">No messages yet.</p> : null}
            {threads.data.threads.map((t) => (
              <button key={t.id} type="button" className={`dr-thr${t.id === selected ? ' on' : ''}`} onClick={() => setPick(t.id)} aria-current={t.id === selected ? 'true' : undefined}>
                <Avatar name={t.patientName} size={38} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong className="dr-strong" style={{ display: 'block' }}>
                    {t.patientName}
                  </strong>
                  <span className="dr-muted" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.lastMessage}
                  </span>
                </span>
                {t.unread > 0 ? (
                  <span className="dr-unread" aria-label={`${t.unread} unread`}>
                    {t.unread}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </Box>
        <Box
          title={info ? info.patientName : 'Conversation'}
          actions={info ? <span className="dr-muted">{info.meta}</span> : undefined}
        >
          {thread.isLoading ? <Loading lines={4} /> : null}
          <ErrorNote error={thread.error} title="Could not load this conversation" />
          <div className="dr-conv" aria-live="polite" aria-label="Conversation">
            {(thread.data?.messages ?? []).map((m) => (
              <div key={m.id} className={m.from === 'me' ? 'dr-bubble dr-b-me' : 'dr-bubble dr-b-pt'}>
                {m.text}
                <span className="dr-b-meta">
                  {m.from === 'me' ? 'You' : thread.data?.patientName} &middot; {fmtDayTime(m.sentAt)}
                </span>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="dr-wrap">
            {threads.data.quickReplies.map((q) => (
              <button key={q} type="button" className="dr-chip" onClick={() => setText(q)}>
                {q}
              </button>
            ))}
          </div>
          <form onSubmit={send} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="cf-sr" htmlFor="dreply">
              Reply to {info?.patientName ?? 'patient'}
            </label>
            <input id="dreply" className="dr-inp" placeholder="Write a reply…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} disabled={!selected || info?.closed} />
            <Button type="submit" size="lg" loading={reply.isPending} disabled={!text.trim() || !selected || info?.closed}>
              Send
            </Button>
          </form>
          {info?.closed ? <p className="dr-muted">This conversation is closed.</p> : null}
          <ErrorNote error={reply.error} title="Could not send the reply" />
          <p className="dr-muted" style={{ margin: 0 }}>
            Messages aren't for emergencies. Patients are told to call 108.
          </p>
        </Box>
      </section>
    </div>
  )
}
