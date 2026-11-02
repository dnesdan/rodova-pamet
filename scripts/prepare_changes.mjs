// Read-only preparation. The Python coordinator owns locking and transactions.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [project, changeFile] = process.argv.slice(2);
if (!project || !changeFile) throw new Error('Expected project and change file.');
const { applyChangeFile } = await import(pathToFileURL(path.join(project, 'scripts/apply-changes.mjs')));
const result = await applyChangeFile(changeFile, {
  dataPath: path.join(project, 'src/data/genealogy.json'), dryRun: true,
  log: value => process.stderr.write(String(value) + '\n'),
});
process.stdout.write(JSON.stringify(result.next));
