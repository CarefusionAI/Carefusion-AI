import { CredentialsForm, LoginCard, LoginPageLinks, SelectField } from '../components/LoginCard'

// Staff login (docs/02 section D): Nurse, Lab Technician, Radiology Technician.
// Accounts are created by the hospital admin, so there is no self-registration link.
export default function StaffLoginPage() {
  return (
    <LoginCard
      title="Staff login"
      subtitle="For nurses, lab technicians and radiology technicians."
    >
      <CredentialsForm
        identifierLabel="Username"
        identifierPlaceholder="Staff username"
        extraFields={
          <SelectField
            label="I am a"
            options={['Nurse', 'Lab Technician', 'Radiology Technician']}
          />
        }
      />

      <p className="rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-700">
        Contact your hospital admin for access. Staff accounts are created by the hospital admin.
      </p>

      <LoginPageLinks current="staff" />
    </LoginCard>
  )
}
