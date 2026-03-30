import express from 'express';
import { Sandbox } from 'e2b';

const app = express();
app.use(express.json());

app.post('/execute', async (req, res) => {
  const { code, language = 'python' } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  let sandbox;
  try {
    sandbox = await Sandbox.create({ timeout: 120 });

    const filename = language === 'python' ? 'main.py' : 'main.js';
    await sandbox.files.write(filename, code);

    const cmd = language === 'python' ? `python3 ${filename}` : `node ${filename}`;
    const result = await sandbox.commands.run(cmd, { timeout: 60 });

    return res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      success: result.exitCode === 0
    });

  } catch (error) {
    return res.status(500).json({ error: error.message, success: false });
  } finally {
    if (sandbox) await sandbox.kill();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));