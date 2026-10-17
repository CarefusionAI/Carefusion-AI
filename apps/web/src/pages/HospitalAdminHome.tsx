import { CreateStaffForm } from '../components/CreateAccountForm'

export default function HospitalAdminHome() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Hospital Admin Dashboard</h1>
        <p className="text-sm text-primary-500">Manage staff accounts and hospital operations.</p>
      </div>
      <CreateStaffForm />
    </div>
  )
}
