import { Runner, RunnerInput, RunnerOutput } from '@patchbay/core';

export class HttpRunner implements Runner {
    name = 'http';

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];
        try {
            // In this simple iteration, we assume input.goal contains the URL to fetch.
            const url = input.goal;

            const response = await fetch(url);
            const text = await response.text();

            logs.push(`Fetched URL: ${url}`);
            logs.push(`Status: ${response.status} ${response.statusText}`);

            return {
                status: response.ok ? 'completed' : 'failed',
                summary: `HTTP GET ${response.ok ? 'successful' : 'failed'}`,
                logs: [...logs, text.substring(0, 1000)] // Store beginning of body as log
            };
        } catch (err: any) {
            logs.push(`ERROR:\n${err.message}`);

            return {
                status: 'failed',
                summary: `HTTP Request failed: ${err.message}`,
                logs
            };
        }
    }
}
