const fs = require('fs-extra');
const path = require('path');

// Copy web client build files to dist
fs.copySync(
  path.join(__dirname, 'src/web/client/build'),
  path.join(__dirname, 'dist/web/client/build'),
  { overwrite: true }
);

console.log('Build files copied successfully');
