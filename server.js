import express from 'express';
import { Sandbox } from 'e2b';

const app = express();
app.use(express.json());

app.post('/execute', async (req, res) => {
  const { code, files } = req.body;

  if (!code && !files) {
    return res.status(400).json({ error: 'No code provided' });
  }

  let sandbox;
  try {
    sandbox = await Sandbox.create({ timeout: 180 });

    let pkgData;

    if (files) {
      // Direct package format (Governance harness sends e2b_package as body)
      pkgData = req.body;
    } else {
      try {
        pkgData = JSON.parse(code);
      } catch (e) {
        // Raw Python fallback
        await sandbox.files.write('main.py', code);
        const result = await sandbox.commands.run('python3 main.py', { timeout: 120, throwOnError: false });
        return res.json({
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode,
          success: result.exitCode === 0
        });
      }
    }

    // Write all files to sandbox
    for (const file of pkgData.files) {
      if (file.filename.includes('/')) {
        const dir = file.filename.substring(0, file.filename.lastIndexOf('/'));
        await sandbox.commands.run(`mkdir -p ${dir}`);
      }
      await sandbox.files.write(file.filename, file.content);
    }

    // Install dependencies (skip standard library modules)
    const stdLibModules = [
      'os', 'sys', 'logging', 'unittest', 'json', 'time',
      'math', 'random', 'datetime', 'collections', 'itertools',
      'functools', 'pathlib', 'io', 'abc', 'typing'
    ];

    if (pkgData.install_dependencies && pkgData.install_dependencies.length > 0) {
      const validDeps = pkgData.install_dependencies.filter(d =>
        !stdLibModules.includes(d.toLowerCase())
      );
      if (validDeps.length > 0) {
        const installResult = await sandbox.commands.run(
          `pip install ${validDeps.join(' ')} -q`,
          { timeout: 60 }
        );
        if (installResult.exitCode !== 0) {
          console.log('Dependency install warning:', installResult.stderr);
        }
      }
    }

    // Run the test command
    const testCmd = pkgData.test_command || `python3 ${pkgData.files[0].filename}`;
    const result = await sandbox.commands.run(testCmd, { timeout: 120, throwOnError: false });

    return res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      success: result.exitCode === 0,
      files_created: pkgData.files.map(f => f.filename),
      test_command: testCmd
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      success: false
    });
  } finally {
    if (sandbox) await sandbox.kill();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));