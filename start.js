const { spawn } = require('child_process');
const proc = spawn('npm', ['run', 'dev'], { 
  shell: true, 
  stdio: 'inherit' 
});