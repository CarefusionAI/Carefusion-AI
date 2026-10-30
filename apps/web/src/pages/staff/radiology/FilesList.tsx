import { useState } from 'react'
import { useWithdrawFile } from '../../../api/radiology'
import type { StudyFileRow } from '../../../api/radiology'
import { Badge, Button, EmptyState } from '../../../components/ui'
import { ConfirmModal } from '../../../components/ClinicalBits'
import { fmtBytes, fmtDateTime } from './util'

/** Files recorded against a study. A wrong-patient upload can be withdrawn for 24 hours, with a reason. */
export default function FilesList({ studyId, files, readOnly }: { studyId: string; files: StudyFileRow[]; readOnly?: boolean }) {
  const withdraw = useWithdrawFile()
  const [target, setTarget] = useState<StudyFileRow | null>(null)

  function close() {
    withdraw.reset()
    setTarget(null)
  }

  if (files.length === 0) return <EmptyState title="No files recorded yet">Add images on the Upload images screen.</EmptyState>

  return (
    <>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.map((f) => (
          <li key={f.id} className="rt-up" style={f.withdrawnAt ? { opacity: 0.7 } : undefined}>
            <span className="rt-mod rt-m-ct rt-up-ext">{f.kind.toUpperCase()}</span>
            <div className="rt-up-body">
              <div className="rt-up-top">
                <strong style={f.withdrawnAt ? { textDecoration: 'line-through' } : undefined}>{f.fileName}</strong>
                <span className="rt-muted">{fmtBytes(f.sizeBytes)}</span>
              </div>
              <span className="rt-muted">
                {f.withdrawnAt ? `Withdrawn ${fmtDateTime(f.withdrawnAt)}: ${f.withdrawnReason ?? ''}` : `Recorded ${fmtDateTime(f.uploadedAt)} by ${f.uploadedBy}`}
              </span>
            </div>
            {f.withdrawnAt ? (
              <Badge tone="neutral">Withdrawn</Badge>
            ) : !readOnly && f.canWithdraw ? (
              <Button size="sm" variant="outline" onClick={() => setTarget(f)}>
                Withdraw
              </Button>
            ) : (
              <Badge tone="success">Recorded</Badge>
            )}
          </li>
        ))}
      </ul>
      <ConfirmModal
        open={!!target}
        title="Withdraw this file?"
        confirmLabel="Withdraw file"
        reasonLabel="Reason (for example wrong patient)"
        danger
        busy={withdraw.isPending}
        error={withdraw.error}
        onClose={close}
        onConfirm={(reason) => target && withdraw.mutate({ studyId, fileId: target.id, reason }, { onSuccess: close })}
      >
        <p style={{ margin: 0 }}>
          <strong>{target?.fileName}</strong> is removed from the study and the patient's record. Withdrawal is possible within 24 hours of the upload and is written to the audit log.
        </p>
      </ConfirmModal>
    </>
  )
}
