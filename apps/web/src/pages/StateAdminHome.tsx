import ApprovalInbox from '../components/ApprovalInbox'

export default function StateAdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">State Admin Dashboard</h1>
        <p className="text-sm text-primary-500">Review and approve registration requests for your state.</p>
      </div>
      <ApprovalInbox adminLevel="state" />
    </div>
  )
}
