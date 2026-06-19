import { useState } from 'react';
import BeaconShell, { type ModuleId } from './components/BeaconShell';
import FloodModule from './components/FloodModule';
import Overview from './components/Overview';
import SupplyModule from './components/SupplyModule';
import ComplaintsModule from './components/ComplaintsModule';
import EducationModule from './components/EducationModule';
import './styles/globals.css';

export default function App() {
  const [active, setActive] = useState<ModuleId>('overview');
  return (
    <BeaconShell active={active} onNavigate={setActive}>
      {active === 'overview' && <Overview onNavigate={setActive} />}
      {active === 'flood' && <FloodModule />}
      {active === 'supply' && <SupplyModule />}
      {active === 'complaints' && <ComplaintsModule />}
      {active === 'education' && <EducationModule />}
    </BeaconShell>
  );
}
