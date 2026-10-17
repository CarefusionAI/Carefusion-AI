import ApprovalInbox from '../components/ApprovalInbox'

export default function CentralAdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Central Admin Dashboard</h1>
        <p className="text-sm text-primary-500">Review and approve registration requests for the central level.</p>
      </div>
      <ApprovalInbox adminLevel="central" />
    </div>
  )
}
