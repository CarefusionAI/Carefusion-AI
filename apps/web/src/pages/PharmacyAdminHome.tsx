import { CreatePharmacistForm } from '../components/CreateAccountForm'

export default function PharmacyAdminHome() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Pharmacy Admin Dashboard</h1>
        <p className="text-sm text-primary-500">Manage pharmacist accounts and pharmacy operations.</p>
      </div>
      <CreatePharmacistForm />
    </div>
  )
}
