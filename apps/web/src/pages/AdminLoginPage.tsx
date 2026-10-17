import { Link } from 'react-router-dom'
import { CredentialsForm, LoginCard, LoginPageLinks, SelectField } from '../components/LoginCard'

// Admin login (docs/02 sections E, F, G).
// Hospital and Pharmacy admins self-register; District, State, Zonal and Central admins are
// created by the level above and sign in with Jan Parichay (mock connector in the alpha, not live).
export default function AdminLoginPage() {
  return (
    <LoginCard
      title="Admin login"
      subtitle="For hospital, pharmacy, district, state, zonal and central admins."
    >
      <CredentialsForm
        identifierLabel="Username"
        identifierPlaceholder="Admin username"
        extraFields={
          <SelectField
            label="I am a"
            options={[
              'Hospital Admin',
              'Pharmacy Admin',
              'District Admin',
              'State Admin',
              'Zonal Admin',
              'Central Admin',
            ]}
          />
        }
      />

      <section aria-labelledby="admin-self-register" className="rounded-md border border-primary-100 bg-primary-50 px-3 py-3">
        <h2 id="admin-self-register" className="text-sm font-semibold text-primary-800">
          Hospital and Pharmacy admins
        </h2>
        <p className="mt-1 text-xs text-primary-600">
          New here? Register your hospital or pharmacy. A district admin approves each request.
        </p>
        <ul className="mt-2 space-y-1">
          <li>
            <Link to="/register/hospital-admin" className="text-sm font-medium text-primary-500 underline hover:text-primary-700">
              Self-register as Hospital Admin
            </Link>
          </li>
          <li>
            <Link to="/register/pharmacy-admin" className="text-sm font-medium text-primary-500 underline hover:text-primary-700">
              Self-register as Pharmacy Admin
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="admin-sso" className="rounded-md border border-primary-100 bg-primary-50 px-3 py-3">
        <h2 id="admin-sso" className="text-sm font-semibold text-primary-800">
          District, State, Zonal and Central admins
        </h2>
        <p className="mt-1 text-xs text-primary-600">
          These accounts are created by the level above and sign in with single sign-on.
        </p>
        <button
          type="button"
          disabled
          className="mt-2 flex w-full cursor-not-allowed items-center justify-between rounded-md border border-primary-200 bg-white px-3 py-2 text-sm font-medium text-primary-300"
        >
          <span>Log in with Jan Parichay (SSO)</span>
          <span className="rounded bg-accent-100 px-2 py-0.5 text-xs font-semibold text-accent-600">
            Coming soon
          </span>
        </button>
      </section>

      <LoginPageLinks current="admin" />
    </LoginCard>
  )
}
