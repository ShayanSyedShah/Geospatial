// Demoted: the Sylhet 2022 response scene moved to the Google-Maps decision model
// (map canvas + layer rail + click-to-open ProtocolPopup → EvidencePanel), so the
// old light-theme protocol card is no longer mounted. This file is kept as a thin
// re-export of the protocol data hook to avoid breaking any stray import path.
import { useProtocol } from '../hooks/useProtocol';

export { useProtocol };
export default useProtocol;
