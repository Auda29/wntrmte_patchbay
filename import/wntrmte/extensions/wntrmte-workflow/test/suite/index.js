const assert = require('assert');
const vscode = require('vscode');

async function waitForExtension(extensionId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const extension = vscode.extensions.getExtension(extensionId);
    if (extension) {
      return extension;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return undefined;
}

async function run() {
  const extensionId = 'wintermute.wntrmte-workflow';
  const extension = await waitForExtension(extensionId);
  assert.ok(extension, `Expected extension ${extensionId} to be available.`);

  if (!extension.isActive) {
    await extension.activate();
  }

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'wntrmte.showOutput',
    'wntrmte.configureClaude',
    'wntrmte.configureCodex',
    'wntrmte.configureGemini',
  ]) {
    assert.ok(commands.includes(command), `Expected command ${command} to be registered.`);
  }

  await vscode.commands.executeCommand('wntrmte.showOutput');
}

module.exports = {
  run,
};
