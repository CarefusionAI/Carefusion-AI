import { useEffect, useState } from 'react'
import { TextField } from '../../components/ui'
import { usePeopleSearch } from '../../api/peopleSearch'
import type { PersonHit } from '../../api/peopleSearch'

/** Search a registered person by name or ABHA number and pick them, instead of typing a UUID. */
export default function PersonPicker({ value, onPick }: { value: PersonHit | null; onPick: (p: PersonHit | null) => void }) {
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setTerm(text), 300)
    return () => clearTimeout(t)
  }, [text])
  const search = usePeopleSearch(value ? '' : term)

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', border: '1px solid var(--line, #d9d2c8)', borderRadius: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{value.fullName}</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            {value.ageYears} years{value.abhaHint ? ` · ABHA ${value.abhaHint}` : ''}
          </div>
        </div>
        <button type="button" className="ak-lk" onClick={() => { onPick(null); setText(''); setTerm('') }}>Change</button>
      </div>
    )
  }
  const hits = search.data?.hits ?? []
  return (
    <div style={{ marginBottom: 12 }}>
      <TextField
        label="Find the person"
        required
        placeholder="Type a name or ABHA number (at least 3 letters)"
        helper="Search registered people (synthetic demo data). Every search is recorded in the audit log."
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {term.trim().length >= 3 && search.isFetching ? <p style={{ fontSize: 13, opacity: 0.7 }}>Searching…</p> : null}
      {term.trim().length >= 3 && !search.isFetching && hits.length === 0 ? <p style={{ fontSize: 13, opacity: 0.7 }}>No one found. Check the spelling, or the person may not be registered yet.</p> : null}
      {hits.length > 0 ? (
        <ul role="listbox" aria-label="People found" style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--line, #d9d2c8)', borderRadius: 10, overflow: 'hidden' }}>
          {hits.map((h) => (
            <li key={h.personId} role="option" aria-selected="false">
              <button type="button" onClick={() => onPick(h)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 0, borderBottom: '1px solid var(--line, #eee7dc)', cursor: 'pointer', font: 'inherit' }}>
                <strong>{h.fullName}</strong>
                <span style={{ opacity: 0.7 }}> · {h.ageYears} years{h.abhaHint ? ` · ABHA ${h.abhaHint}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
