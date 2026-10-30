import { useEffect, useState } from 'react'
import { useRooms, useScheduleStudy } from '../../../api/radiology'
import { Alert, Button, Modal, Select, TextField } from '../../../components/ui'
import { errorText } from '../../../api/clinicalHttp'
import { istLocalToIso } from './util'
import { demoNow } from '../../../lib/demoClock'

function defaultStart(): string {
  const d = new Date(demoNow() + 5.5 * 3600_000 + 30 * 60_000)
  d.setUTCMinutes(d.getUTCMinutes() < 30 ? 0 : 30, 0, 0)
  return d.toISOString().slice(0, 16)
}

/** Book a waiting study into a room and time (IST). Rooms are limited to the study's modality and to rooms that are up. */
export default function ScheduleModal({
  open,
  onClose,
  study,
}: {
  open: boolean
  onClose: () => void
  study: { studyId: string; modality: string; label: string } | null
}) {
  const rooms = useRooms()
  const schedule = useScheduleStudy()
  const [roomId, setRoomId] = useState('')
  const [start, setStart] = useState(defaultStart)
  const [minutes, setMinutes] = useState('30')

  useEffect(() => {
    if (open) {
      schedule.reset()
      setRoomId('')
      setStart(defaultStart())
      setMinutes('30')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const options = (rooms.data ?? [])
    .filter((r) => r.status === 'ok' && study && (r.modality === study.modality || (r.modality === 'XR' && study.modality === 'PORTABLE')))
    .map((r) => ({ value: r.id, label: r.name }))

  return (
    <Modal
      open={open && !!study}
      title="Schedule study"
      size="sm"
      onClose={schedule.isPending ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={schedule.isPending}>
            Cancel
          </Button>
          <Button
            loading={schedule.isPending}
            disabled={!roomId || !start}
            onClick={() =>
              study &&
              schedule.mutate({ studyId: study.studyId, roomId, startsAt: istLocalToIso(start), durationMinutes: Number(minutes) }, { onSuccess: onClose })
            }
          >
            Book slot
          </Button>
        </>
      }
    >
      <div className="rt-stack">
        <p style={{ margin: 0 }}>{study?.label}</p>
        <Select label="Room" required value={roomId} onChange={setRoomId} placeholder="Choose a room" options={options} helper={options.length ? undefined : 'No room that is up matches this modality.'} />
        <TextField label="Start (India time)" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
        <Select label="Length" value={minutes} onChange={setMinutes} options={['15', '30', '45', '60', '90'].map((m) => ({ value: m, label: `${m} minutes` }))} />
        {schedule.isError ? <Alert tone="danger">{errorText(schedule.error)}</Alert> : null}
      </div>
    </Modal>
  )
}
