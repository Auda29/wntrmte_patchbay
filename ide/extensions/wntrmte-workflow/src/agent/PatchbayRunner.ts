import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { getPatchbayCliExecutable } from '../services/SetupInspector';

export type RunResult = 'completed' | 'failed' | 'cancelled';

export class PatchbayRunner {
    async run(
        taskId: string,
        runnerId: string,
        workspaceRoot: string,
        outputChannel: vscode.OutputChannel,
        token?: vscode.CancellationToken
    ): Promise<RunResult> {
        return new Promise<RunResult>((resolve) => {
            outputChannel.appendLine(`\n--- patchbay run ${taskId} ${runnerId} ---\n`);
            outputChannel.show(true);

            const proc = spawn(getPatchbayCliExecutable(), ['run', taskId, runnerId], {
                cwd: workspaceRoot,
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            const onCancel = token?.onCancellationRequested(() => {
                proc.kill();
                outputChannel.appendLine('\n[cancelled by user]');
                resolve('cancelled');
            });

            proc.stdout.on('data', (data: Buffer) => {
                outputChannel.append(data.toString());
            });

            proc.stderr.on('data', (data: Buffer) => {
                outputChannel.append(data.toString());
            });

            proc.on('error', (err) => {
                outputChannel.appendLine(`\n[error: ${err.message}]`);
                resolve('failed');
                onCancel?.dispose();
            });

            proc.on('close', (code) => {
                outputChannel.appendLine(`\n--- exit ${code ?? 'unknown'} ---`);
                onCancel?.dispose();
                resolve(code === 0 ? 'completed' : 'failed');
            });
        });
    }
}
