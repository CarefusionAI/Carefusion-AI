import ApprovalInbox from '../components/ApprovalInbox'
import { CreateAdminForm } from '../components/CreateAccountForm'

export default function CentralAdminHome() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Central Admin Dashboard</h1>
        <p className="text-sm text-primary-500">National oversight — approvals and admin management.</p>
      </div>
      <ApprovalInbox adminLevel="central" />
      <CreateAdminForm creatorLevel="central" />
    </div>
  )
}
