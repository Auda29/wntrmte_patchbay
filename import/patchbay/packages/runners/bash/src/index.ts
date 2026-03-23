import { Runner, RunnerInput, RunnerOutput } from '@patchbay/core';
import { spawn } from 'child_process';

export class BashRunner implements Runner {
    name = 'bash';

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];

        return new Promise<RunnerOutput>((resolve) => {
            const command = input.goal;
            const child = spawn(command, {
                cwd: input.repoPath,
                shell: true,
            });

            child.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                process.stdout.write(text);
                logs.push(text);
            });

            child.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                process.stderr.write(text);
                logs.push(text);
            });

            child.on('error', (error: Error) => {
                const message = error.message;
                logs.push(`ERROR:\n${message}`);
                resolve({
                    status: 'failed',
                    summary: `Command failed: ${message}`,
                    logs,
                });
            });

            child.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve({
                        status: 'completed',
                        summary: 'Successfully executed Bash command',
                        logs,
                    });
                } else {
                    logs.push(`EXIT CODE: ${code ?? 'null'}`);
                    logs.push('HINT: The Bash runner executes goal as a shell command. Make sure goal is a valid shell command, not natural language.');
                    resolve({
                        status: 'failed',
                        summary: `Command failed with code ${code}`,
                        logs,
                    });
                }
            });
        });
    }
}
