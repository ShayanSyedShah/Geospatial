import { useState } from 'react';

// One real, attributed human anchor — dignity-preserving (real quote, real source,
// no invented imagery). Lands the emotion without melodrama.
export default function HumanAnchor() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="human-anchor">
      <button className="ha-close" onClick={() => setOpen(false)}>×</button>
      <p>
        “The money I received ~24 hours before the water rose brought us relief — we bought dry food and
        moved our beds and animals to safety.”
      </p>
      <span className="ha-cite">— Salma Khatun, Sirajganj, July 2024 · via OCHA</span>
    </div>
  );
}
