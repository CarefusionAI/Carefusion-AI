import ApprovalInbox from '../components/ApprovalInbox'

export default function DistrictAdminHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">District Admin Dashboard</h1>
        <p className="text-sm text-primary-500">Review and approve registration requests for your district.</p>
      </div>
      <ApprovalInbox adminLevel="district" />
    </div>
  )
}
