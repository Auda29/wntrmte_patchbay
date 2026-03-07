import { Runner, RunnerInput, RunnerOutput } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BashRunner implements Runner {
    name = 'bash';

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];
        try {
            // In this simple iteration, we assume input.goal contains the command.
            const command = input.goal;

            const { stdout, stderr } = await execAsync(command, { cwd: input.repoPath });

            if (stdout) logs.push(`STDOUT:\n${stdout}`);
            if (stderr) logs.push(`STDERR:\n${stderr}`);

            return {
                status: 'completed',
                summary: `Successfully executed Bash command`,
                logs
            };
        } catch (err: any) {
            if (err.stdout) logs.push(`STDOUT:\n${err.stdout}`);
            if (err.stderr) logs.push(`STDERR:\n${err.stderr}`);
            logs.push(`ERROR:\n${err.message}`);

            return {
                status: 'failed',
                summary: `Command failed with code ${err.code}`,
                logs
            };
        }
    }
}
