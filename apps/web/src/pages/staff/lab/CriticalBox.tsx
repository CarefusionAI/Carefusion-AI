import { useState } from 'react'
import { Alert, Badge, Button, Checkbox, Modal, TextField, Textarea } from '../../../components/ui'
import { errMessage } from '../../../api/nurse'
import { useAckCriticalCall, useLabCritical, useLogCriticalCall } from '../../../api/lab'
import { BoxHead, Empty, ErrorBlock, Loading, fmtTime } from './common'
import type { Go } from '../nurse/types'

interface Target {
  resultValueId: string
  label: string
  suggestedName: string
}

/** Critical values that still need a phone call, and the recent call log with read-back. */
export default function CriticalBox(_props: { go?: Go }) {
  const crit = useLabCritical()
  const ack = useAckCriticalCall()
  const [target, setTarget] = useState<Target | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="lb-box">
      <BoxHead title="Critical values to call" right={crit.data ? <Badge tone={crit.data.uncalled.length ? 'danger' : 'success'} icon={<span>{crit.data.uncalled.length ? '‼' : '✓'}</span>}>{crit.data.uncalled.length} to call</Badge> : undefined} />
      {crit.isLoading ? (
        <Loading rows={3} label="Loading critical values" />
      ) : crit.isError ? (
        <ErrorBlock error={crit.error} onRetry={() => void crit.refetch()} />
      ) : (
        <>
          {error ? <Alert tone="danger" title="Not saved" onDismiss={() => setError(null)}>{error}</Alert> : null}
          {crit.data!.uncalled.length === 0 && crit.data!.calls.length === 0 ? <Empty title="No critical values">Nothing critical in the last 7 days.</Empty> : null}
          {crit.data!.uncalled.map((u) => (
            <div className="lb-row" key={u.resultValueId}>
              <Badge tone="danger" icon={<span>‼</span>}>{u.testCode} {u.valueNum ?? ''}{u.unit ? ` ${u.unit}` : ''}</Badge>
              <span className="lb-grow" style={{ fontSize: 14 }}>{u.patientName}{u.bedNo ? ` · Bed ${u.bedNo}` : ''} · call {u.callDoctor.name}</span>
              <button type="button" className="lb-lk" onClick={() => setTarget({ resultValueId: u.resultValueId, label: `${u.testCode} ${u.valueNum ?? ''} · ${u.patientName}`, suggestedName: u.callDoctor.name })}>Log call</button>
            </div>
          ))}
          {crit.data!.calls.slice(0, 6).map((c) => (
            <div className="lb-row" key={c.id}>
              <Badge tone="warning" icon={<span>!</span>}>{c.testCode} {c.valueNum ?? ''}</Badge>
              <span className="lb-grow" style={{ fontSize: 14 }}>
                {c.patientName} · {fmtTime(c.calledAt)} → {c.calledTo ?? 'unknown'}
              </span>
              {c.readBackConfirmed ? (
                <Badge tone="success" icon={<span>✓</span>}>Read back</Badge>
              ) : (
                <Button size="sm" variant="outline" loading={ack.isPending && ack.variables?.id === c.id} onClick={() => { setError(null); ack.mutate({ id: c.id }, { onError: (e) => setError(errMessage(e)) }) }}>
                  Confirm read-back
                </Button>
              )}
            </div>
          ))}
        </>
      )}
      {target ? <CallModal target={target} onClose={() => setTarget(null)} /> : null}
    </div>
  )
}

export function CallModal({ target, onClose }: { target: Target; onClose: () => void }) {
  const log = useLogCriticalCall()
  const [name, setName] = useState(target.suggestedName)
  const [readBack, setReadBack] = useState(false)
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const missing = name.trim().length === 0
  return (
    <Modal
      open
      title="Log a critical value call"
      size="sm"
      onClose={log.isPending ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={log.isPending}>Cancel</Button>
          <Button
            loading={log.isPending}
            onClick={() => {
              setTouched(true)
              setError(null)
              if (missing) return
              log.mutate({ resultValueId: target.resultValueId, calledToName: name.trim(), readBackConfirmed: readBack, note: note.trim() || undefined }, { onSuccess: onClose, onError: (e) => setError(errMessage(e)) })
            }}
          >
            Save call
          </Button>
        </>
      }
    >
      <div className="lb-list">
        <p style={{ margin: 0 }}>{target.label}</p>
        <TextField label="Who took the call" value={name} onChange={(e) => setName(e.target.value)} error={touched && missing ? 'Say who took the call.' : undefined} maxLength={120} />
        <Checkbox label="Read-back confirmed" description="They repeated the value back to you correctly" checked={readBack} onChange={setReadBack} />
        {!readBack ? <p className="lb-muted" style={{ margin: 0 }}>Without read-back the call stays open until you confirm it.</p> : null}
        <Textarea label="Note" optional rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        {error ? <Alert tone="danger" title="Not saved">{error}</Alert> : null}
      </div>
    </Modal>
  )
}
