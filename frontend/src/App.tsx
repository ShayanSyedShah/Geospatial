import { Suspense, lazy, useState } from 'react';
import BeaconShell, { type ModuleId } from './components/BeaconShell';
import Overview from './components/Overview';
import './styles/globals.css';

const FloodModule = lazy(() => import('./components/FloodModule'));
const Sylhet2022Module = lazy(() => import('./components/Sylhet2022Module'));
const SupplyModule = lazy(() => import('./components/SupplyModule'));
const ComplaintsModule = lazy(() => import('./components/ComplaintsModule'));
const EducationModule = lazy(() => import('./components/EducationModule'));

export default function App() {
  const [active, setActive] = useState<ModuleId>('flood');
  return (
    <BeaconShell active={active} onNavigate={setActive}>
      {active === 'overview' && <Overview onNavigate={setActive} />}
      <Suspense fallback={<div className="module-pad"><p className="mod-loading">Loading module...</p></div>}>
        {active === 'flood' && <FloodModule />}
        {active === 'sylhet2022' && <Sylhet2022Module />}
        {active === 'supply' && <SupplyModule />}
        {active === 'complaints' && <ComplaintsModule />}
        {active === 'education' && <EducationModule />}
      </Suspense>
    </BeaconShell>
  );
}
