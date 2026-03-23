import * as fs from 'fs';
import { EventEmitter } from 'events';

class EventBus extends EventEmitter {
    private watcher: fs.FSWatcher | null = null;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;

    start(projectAgentsDir: string) {
        if (this.watcher) return;

        if (!fs.existsSync(projectAgentsDir)) return;

        this.watcher = fs.watch(projectAgentsDir, { recursive: true }, () => {
            // Debounce: rapid file changes (e.g. multiple writes) collapse into one event
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.emit('change');
            }, 100);
        });
    }

    stop() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.watcher?.close();
        this.watcher = null;
    }
}

// Singleton — lazily started on first SSE subscription
let instance: EventBus | null = null;

export function getEventBus(projectAgentsDir?: string): EventBus {
    if (!instance) {
        instance = new EventBus();
        if (projectAgentsDir) {
            instance.start(projectAgentsDir);
        }
    }
    return instance;
}
