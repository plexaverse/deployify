const fs = require('fs');

const path = 'src/lib/gcp/remediation-utils.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
    /storage\.region = projectRegion;\s*storage\.metadata = \{\s*\.\.\.storage\.metadata,\s*operationName: result\.operationName,\s*resourceName: result\.targetInstanceName,\s*migratingFromRegion: storage\.region\s*\};/,
    `const originalRegion = storage.region;
                    storage.region = projectRegion;
                    storage.metadata = {
                        ...storage.metadata,
                        operationName: result.operationName,
                        resourceName: result.targetInstanceName,
                        migratingFromRegion: originalRegion
                    };`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done!');
