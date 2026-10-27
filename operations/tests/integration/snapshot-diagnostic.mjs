import {isolatedConfiguration,runCoordination,reportEntryFailure} from './coordination-probe.mjs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Separate opt-in invocation; never run implicitly with the primary probe.
// Importing this module does not start the diagnostic or open connections.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    await runCoordination({...isolatedConfiguration(process.argv.slice(2)),snapshotDiagnostic:true});
  } catch(error) {reportEntryFailure(error);}
}
