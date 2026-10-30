import CitizenHome from './CitizenHome'

// Design screen Citizen.dc.html ("full prototype"). In the app every citizen screen is its own
// route (/citizen/<screen>) inside the AppShell, so the prototype entry is simply the Home screen.
// The shell parts (sidebar sections, badges, Activity log / bell / Share key) live in
// components/AppShell.tsx, config/nav.ts and CitizenTopActions.tsx.
export default function CitizenScreen() {
  return <CitizenHome />
}
