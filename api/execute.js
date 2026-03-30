import { Sandbox } from 'e2b';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, language = 'python' } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  let sandbox;
  try {
    sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
      timeout: 120
    });

    const filename = language === 'python' ? 'main.py' : 'main.js';
    await sandbox.files.write(filename, code);

    const cmd = language === 'python' ? `python3 ${filename}` : `node ${filename}`;
    const result = await sandbox.commands.run(cmd, { timeout: 60 });

    return res.status(200).json({
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      success: result.exitCode === 0
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      success: false
    });
  } finally {
    if (sandbox) await sandbox.kill();
  }
}