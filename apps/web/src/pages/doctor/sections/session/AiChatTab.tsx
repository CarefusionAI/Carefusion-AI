import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Badge, Button } from '../../../../components/ui'
import { useAiChat, useAiChatHistory } from '../../../../api/doctor'
import type { AIInsight, AiChatMessage } from '../../../../api/doctor'
import { AiCard, Box, ErrorNote } from '../../parts'

const QUICK = ['Antibiotic options with penicillin allergy?', 'Summarise last 3 visits', 'Statin interactions with metformin?']

export default function AiChatTab({ sid, canReview }: { sid: string; canReview: boolean }) {
  const history = useAiChatHistory(sid)
  const chat = useAiChat(sid)
  const [text, setText] = useState('')
  const [pendingUser, setPendingUser] = useState<string | null>(null)
  const [latest, setLatest] = useState<{ chatSessionId: string; messages: AiChatMessage[]; insight: AIInsight } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const messages: AiChatMessage[] = latest?.messages ?? history.data?.current?.messages ?? []
  const chatSessionId = latest?.chatSessionId ?? history.data?.current?.chatSessionId
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [messages.length, pendingUser])

  function ask(q: string) {
    const message = q.trim()
    if (!message || chat.isPending) return
    setPendingUser(message)
    setText('')
    chat.mutate(
      { message, chatSessionId },
      {
        onSuccess: (r) => setLatest(r),
        onSettled: () => setPendingUser(null),
      },
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    ask(text)
  }

  return (
    <section className="dr-grid dr-s21">
      <Box title="Clinical AI chat" tone="lavender" actions={<Badge tone="ai">Simulated · guidance only</Badge>}>
        <div className="dr-conv" aria-live="polite" aria-label="Conversation with the simulated clinical AI">
          {messages.length === 0 && !pendingUser ? <p className="dr-muted">Ask a question about this patient. Answers cite the patient's records.</p> : null}
          {messages.map((m) => (
            <div key={m.seq} className={m.role === 'user' ? 'dr-bubble dr-b-me' : 'dr-bubble dr-b-ai'}>
              {m.role === 'assistant' ? <span className="dr-b-tag">Simulated AI output</span> : null}
              {m.text}
              {m.redFlag ? (
                <div style={{ marginTop: 6 }}>
                  <Badge tone="danger">Red flag: needs clinical attention</Badge>
                </div>
              ) : null}
            </div>
          ))}
          {pendingUser ? <div className="dr-bubble dr-b-me">{pendingUser}</div> : null}
          {chat.isPending ? <div className="dr-bubble dr-b-ai">Thinking (simulated)…</div> : null}
          <div ref={endRef} />
        </div>
        <div className="dr-wrap">
          {QUICK.map((q) => (
            <button key={q} type="button" className="dr-chip" disabled={chat.isPending} onClick={() => ask(q)}>
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
          <label className="cf-sr" htmlFor="dchat">
            Ask the AI about this patient
          </label>
          <input id="dchat" className="dr-inp" placeholder="Ask about this patient…" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="ai" loading={chat.isPending} disabled={!text.trim()}>
            Ask
          </Button>
        </form>
        <ErrorNote error={chat.error} title="The AI could not answer" />
      </Box>
      <div className="dr-col">
        {latest ? (
          <AiCard insight={latest.insight} canReview={canReview} />
        ) : (
          <Alert tone="ai" title="You decide">
            Answers cite records. Nothing is written to the chart unless you accept it. Ask a question to see the confidence label and the AI models' disagreement report.
          </Alert>
        )}
        {latest ? (
          <Box title="Context the AI used">
            {latest.insight.sources.length === 0 ? <p className="dr-muted">No sources were cited.</p> : null}
            {latest.insight.sources.map((s) => (
              <div className="dr-row" key={s.ref}>
                <span className="dr-tok dr-t-blue" aria-hidden="true">
                  {s.type.slice(0, 2).toUpperCase()}
                </span>
                <div className="dr-row-main dr-muted">
                  {s.ref} &middot; relevance {Math.round(s.relevance * 100)}%
                </div>
              </div>
            ))}
          </Box>
        ) : null}
      </div>
    </section>
  )
}
