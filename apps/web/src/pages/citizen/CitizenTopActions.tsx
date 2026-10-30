import { useNavigate } from 'react-router-dom'
import { useAlertsUnread } from '../../api/citizen1'
import { ICONS, Icon } from './CitizenKit'
import './CitizenKit.css'

/**
 * Citizen top-bar actions from Citizen.dc.html: Activity log, notification bell with the unread
 * count, and "Share key". Rendered by AppShell in the top bar when the signed-in role is CITIZEN.
 */
export default function CitizenTopActions() {
  const navigate = useNavigate()
  const unread = useAlertsUnread(true).data ?? 0
  return (
    <div className="c1-top">
      <button
        type="button"
        className="c1-logbtn"
        aria-label="Activity log: who opened my record"
        onClick={() => navigate('/citizen/access')}
      >
        <Icon d={ICONS.clock} size={18} />
        <span>Activity log</span>
      </button>
      <button
        type="button"
        className="c1-topbtn"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => navigate('/citizen/alerts')}
      >
        <Icon d={ICONS.bell} />
        {unread ? (
          <span className="c1-cnt" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      <button type="button" className="c1-topbtn key" aria-label="Show my key to a doctor" onClick={() => navigate('/citizen/access')}>
        <Icon d={ICONS.qr} size={18} />
        <span>Share key</span>
      </button>
    </div>
  )
}
