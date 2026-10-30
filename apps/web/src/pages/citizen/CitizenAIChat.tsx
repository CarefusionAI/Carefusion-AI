import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import type { ChatMessageDto, ChatSessionDto } from '@carefusion/shared'
import { AIInsight, Alert, Badge, Button, EmptyState, PageHeader, Skeleton, Switch } from '../../components/ui'
import {
  errorMessage,
  useChatContext,
  useChatSession,
  useChatSessions,
  useSendChatMessage,
  useShareChat,
  useStartChat,
} from '../../api/citizen1'
import { Box, ICONS, Icon, MutationError, Page, fmt, plural } from './CitizenKit'

// AI Health Chat (CitizenAIChat.dc.html). Every answer is SIMULATED in the alpha and is shown only
// through <AIInsight>, labelled "Simulated AI output". Guidance only, never a diagnosis.

function Call108() {
  return (
    <a href="tel:108" className="c1-call">
      <Icon d={ICONS.phone} size={18} />
      Call 108 ambulance
    </a>
  )
}

function UserBubble({ m }: { m: ChatMessageDto }) {
  return (
    <div className="c1-msg me">
      <div>
        <div className="c1-bub">{m.text}</div>
        <div className="c1-meta">You · {fmt.time(m.createdAt)}</div>
      </div>
    </div>
  )
}

function AssistantMessage({ m }: { m: ChatMessageDto }) {
  if (m.redFlag) {
    // Warning signs: stop, show the API's text as an alert and offer the ambulance call.
    return (
      <div className="c1-msg" style={{ maxWidth: '100%' }}>
        <div style={{ width: '100%' }}>
          <div role="alert" className="c1-stop">
            <strong>Stop and get help now</strong>
            <span style={{ color: 'var(--ink-body)' }}>{m.text}</span>
            {m.redFlagReason ? <span style={{ color: 'var(--ink-body)', fontSize: 13 }}>Why: {m.redFlagReason}</span> : null}
            <a href="tel:108"><Icon d={ICONS.phone} size={18} />Call 108 ambulance</a>
          </div>
          <div className="c1-meta">CareFusion AI safety stop · {fmt.time(m.createdAt)}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="c1-msg">
      <span className="c1-orb sm" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 64 64"><rect x="21" y="5" width="18" height="50" rx="9" fill="#b7a6d4" /><rect x="9" y="25" width="50" height="18" rx="9" fill="#6a5a8c" /></svg>
      </span>
      <div style={{ minWidth: 0 }}>
        <AIInsight
          className="c1-chat-ai"
          label="Simulated AI answer"
          module="Guidance only"
          simulated
          evidence={m.sourceRefs.map((s) => s.label)}
        >
          <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
        </AIInsight>
        <div className="c1-meta">CareFusion AI · {fmt.time(m.createdAt)}</div>
      </div>
    </div>
  )
}

function Conversation({ sessionId, onSession }: { sessionId: string | null; onSession: (id: string | null) => void }) {
  const ctx = useChatContext()
  const detail = useChatSession(sessionId)
  const start = useStartChat()
  const send = useSendChatMessage(sessionId)
  const share = useShareChat(sessionId)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [disclaimer, setDisclaimer] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const busy = start.isPending || send.isPending

  const messages = (sessionId ? detail.data?.messages : undefined) ?? []

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages.length, pending])

  function ask(text: string) {
    const t = text.trim()
    if (!t || busy) return
    setDraft('')
    setPending(t)
    const done = () => setPending(null)
    if (!sessionId) {
      start.mutate(t, {
        onSuccess: (r) => {
          if ('disclaimer' in r) setDisclaimer(r.disclaimer)
          onSession(r.session.id)
        },
        onSettled: done,
      })
    } else {
      send.mutate(t, {
        onSuccess: (r) => setDisclaimer(r.disclaimer),
        onSettled: done,
      })
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    ask(draft)
  }

  const shared = Boolean(detail.data?.sharedWithDoctorUserId)
  const suggestions = ctx.data?.suggestions ?? []

  return (
    <section className="c1-chat" aria-label="Conversation with CareFusion AI">
      <div className="c1-ch">
        <span className="c1-orb" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 64 64"><rect x="21" y="5" width="18" height="50" rx="9" fill="#b7a6d4" /><rect x="9" y="25" width="50" height="18" rx="9" fill="#6a5a8c" /></svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong className="c1-strong">CareFusion AI</strong>
          <div className="c1-muted">Uses only what your doctors have reviewed · nothing is shared unless you share it</div>
        </div>
        <Badge tone="ai">Simulated AI output</Badge>
        <Button variant="soft" size="sm" loading={share.isPending} disabled={!sessionId || shared || messages.length === 0} onClick={() => share.mutate(undefined)}>
          {shared ? 'Shared with your doctor ✓' : 'Share with my doctor'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { onSession(null); setDisclaimer(null); setPending(null) }}>New chat</Button>
      </div>

      <div className="c1-chatlog" ref={logRef} aria-live="polite" aria-busy={busy}>
        {sessionId && detail.isPending ? (
          <div role="status" aria-label="Loading the conversation"><Skeleton lines={5} height={16} /></div>
        ) : sessionId && detail.isError ? (
          <Alert tone="warning" title="Could not load this chat">{errorMessage(detail.error)}</Alert>
        ) : messages.length === 0 && !pending ? (
          <EmptyState title="Ask about your reports, medicines or symptoms" icon={<Icon d={ICONS.ai} size={26} />}>
            Answers are simulated guidance. The AI cannot diagnose or prescribe.
          </EmptyState>
        ) : (
          messages.map((m) => (m.role === 'user' ? <UserBubble key={m.id} m={m} /> : m.role === 'assistant' ? <AssistantMessage key={m.id} m={m} /> : null))
        )}
        {pending ? (
          <>
            <div className="c1-msg me"><div><div className="c1-bub">{pending}</div><div className="c1-meta">You · sending</div></div></div>
            <div className="c1-msg">
              <span className="c1-orb sm" aria-hidden="true" />
              <div className="c1-bub" style={{ background: 'var(--surface-raised)', border: '1px solid #e3d9ee' }}>
                <span className="c1-dots" role="status" aria-label="CareFusion AI is typing"><i /><i /><i /></span>
              </div>
            </div>
          </>
        ) : null}
        <MutationError error={start.error ?? send.error ?? share.error} />
      </div>

      {suggestions.length ? (
        <div className="c1-chips" aria-label="Suggested questions">
          {suggestions.map((s) => (
            <button key={s} type="button" className="c1-cchip" disabled={busy} onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      ) : null}
      <form className="c1-comp" onSubmit={submit}>
        <label htmlFor="ai-in" className="c1-srx">Message CareFusion AI</label>
        <input id="ai-in" className="c1-cin" placeholder="Ask about your health…" value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
        <button type="submit" className="c1-send" aria-label="Send" disabled={busy || !draft.trim()}>
          <Icon d={ICONS.send} size={20} stroke={2} />
        </button>
      </form>
      <p className="c1-muted" style={{ margin: '0 22px 14px' }}>{disclaimer ?? ctx.data?.disclaimer ?? 'This is simulated AI output, not a diagnosis.'}</p>
    </section>
  )
}

function Aside({ sessionId, onSession, sessions }: { sessionId: string | null; onSession: (id: string) => void; sessions: ReturnType<typeof useChatSessions> }) {
  const go = useNavigate()
  const ctx = useChatContext()
  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }} aria-label="Chat context and safety">
      <div className="c1-sos">
        <strong style={{ color: 'var(--danger)' }}>Chest pain, trouble breathing or fainting?</strong>
        <span style={{ fontSize: 14, color: 'var(--ink-body)' }}>Don't wait for the chat. Call for help now.</span>
        <Call108 />
        <span className="c1-muted">The AI stops and shows this if it spots warning signs.</span>
      </div>
      <Box title="What the AI can see">
        {ctx.isPending ? (
          <Skeleton lines={3} height={14} />
        ) : ctx.isError ? (
          <Alert tone="warning" title="Could not load">{errorMessage(ctx.error)}</Alert>
        ) : (
          <>
            {ctx.data.canSee.map((c) => (
              <div className="c1-ctx" key={c.label}>
                <span style={{ color: 'var(--primary-text)' }}><Icon d={ICONS.doc} size={18} /></span>
                <span style={{ flex: 1 }}>{c.label}</span>
                <Badge tone={c.enabled ? 'success' : 'neutral'}>{c.enabled ? 'On' : 'Off'}</Badge>
              </div>
            ))}
            <Switch label="Use my record in this chat" description="Change this in Settings" checked disabled />
          </>
        )}
      </Box>
      <Box tone="lav" title="How to read answers">
        <p style={{ margin: 0, fontSize: 13, lineHeight: '20px' }}>
          Every answer is labelled Simulated AI output and shows where it came from. It is never a diagnosis or a prescription. For changes to medicines, message your doctor.
        </p>
        <div><Button variant="ai" size="sm" onClick={() => go('/citizen/messages')}>Message your doctor</Button></div>
      </Box>
      <Box title="Earlier chats">
        {sessions.isPending ? (
          <Skeleton lines={3} height={14} />
        ) : sessions.isError ? (
          <span className="c1-muted">Could not load earlier chats.</span>
        ) : (sessions.data ?? []).length === 0 ? (
          <span className="c1-muted">No earlier chats yet.</span>
        ) : (
          <div className="c1-earlier">
            {(sessions.data ?? []).map((s: ChatSessionDto) => (
              <button key={s.id} type="button" className={s.id === sessionId ? 'on' : undefined} aria-current={s.id === sessionId ? 'true' : undefined} onClick={() => onSession(s.id)}>
                <strong>{s.title ?? 'Chat'}</strong>
                <br />
                {fmt.dayMon(s.startedAt)} · {plural(s.messageCount, 'message')}
              </button>
            ))}
          </div>
        )}
      </Box>
    </aside>
  )
}

export default function CitizenAIChat() {
  const sessions = useChatSessions()
  const [sessionId, setSessionId] = useState<string | null>(null)
  return (
    <Page label="AI Health Chat">
      <PageHeader eyebrow="Health" title="AI Health Chat" subtitle="Ask about your reports, medicines and symptoms. Guidance only — it can't diagnose or prescribe." />
      <div className="c1-lay-chat">
        <Conversation sessionId={sessionId} onSession={setSessionId} />
        <Aside sessionId={sessionId} onSession={setSessionId} sessions={sessions} />
      </div>
    </Page>
  )
}
