import { useState } from 'react'
import { Alert, Badge, Button, Modal, Table } from '../../../../components/ui'
import type { TableColumn } from '../../../../components/ui'
import { useOpenFile, useSessionFiles } from '../../../../api/doctor'
import type { OpenedFile, SessionFile } from '../../../../api/doctor'
import { Box, ErrorNote, Loading } from '../../parts'
import { fmtBytes, fmtDay } from '../../format'

export default function FilesTab({ sid }: { sid: string }) {
  const q = useSessionFiles(sid)
  const open = useOpenFile(sid)
  const [opened, setOpened] = useState<OpenedFile | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function openFile(f: SessionFile) {
    setBusyId(f.id)
    open.mutate(f.id, { onSuccess: setOpened, onSettled: () => setBusyId(null) })
  }

  const cols: TableColumn<SessionFile>[] = [
    {
      key: 'title',
      header: 'File',
      render: (f) => (
        <span>
          <strong className="dr-strong">{f.title}</strong>
          {f.isNew ? (
            <>
              {' '}
              <Badge tone="info">New</Badge>
            </>
          ) : null}
          {f.addedByMe ? (
            <>
              {' '}
              <Badge tone="teal">Added by you</Badge>
            </>
          ) : null}
        </span>
      ),
    },
    { key: 'type', header: 'Type' },
    { key: 'source', header: 'Source' },
    { key: 'createdAt', header: 'Date', render: (f) => fmtDay(f.createdAt) },
    { key: 'sizeBytes', header: 'Size', render: (f) => fmtBytes(f.sizeBytes) },
    {
      key: 'open',
      header: <span className="cf-sr">Open</span>,
      render: (f) => (
        <Button size="sm" variant="secondary" loading={busyId === f.id} onClick={() => openFile(f)} aria-label={`Open ${f.title}`}>
          Open
        </Button>
      ),
    },
  ]

  return (
    <Box title="Files" actions={<Badge tone="neutral">Each open is logged to the patient</Badge>}>
      {q.isLoading ? <Loading /> : null}
      <ErrorNote error={q.error} title="Could not load the files" />
      <ErrorNote error={open.error} title="Could not open that file" />
      {q.data ? <Table columns={cols} rows={q.data.files} rowKey="id" striped caption="Patient files" empty="No files visible in this session." /> : null}
      <Modal
        open={opened !== null}
        title={opened?.title ?? 'File'}
        size="lg"
        onClose={() => setOpened(null)}
        footer={
          <>
            {opened?.url ? (
              <a className="cf-btn cf-btn-primary cf-btn-md" style={{ textDecoration: 'none' }} href={opened.url} target="_blank" rel="noopener noreferrer">
                <span className="cf-btn-label">Open in a new tab</span>
              </a>
            ) : null}
            <Button variant="secondary" onClick={() => setOpened(null)}>
              Close
            </Button>
          </>
        }
      >
        <div className="dr-stack">
          <Alert tone="info" title="Logged to the patient">
            This open is recorded in the patient's access history with your name. The link works for about 15 minutes.
          </Alert>
          {opened?.text ? <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13 }}>{opened.text}</pre> : null}
          {opened?.url && opened.mimeType?.startsWith('image/') ? (
            <img src={opened.url} alt={opened.title} style={{ maxWidth: '100%', borderRadius: 12 }} />
          ) : null}
          {!opened?.url && !opened?.text ? <p className="dr-muted">There is nothing to preview for this file.</p> : null}
        </div>
      </Modal>
    </Box>
  )
}
