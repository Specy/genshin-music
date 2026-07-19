import type {LeaveHandler, NavigationTarget} from './types';

export class LeaveGuard {
    private handler: LeaveHandler | null = null;

    async canLeave(target: NavigationTarget): Promise<boolean> {
        return this.handler === null ? true : this.handler(target);
    }

    register(handler: LeaveHandler): () => void {
        this.handler = handler;
        return () => {
            if (this.handler === handler) this.handler = null;
        };
    }
}
