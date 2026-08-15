export type ServiceWorkerUpdateStatus = {
  currentClientIsStale: boolean;
  hasOtherClients: boolean;
};

export function isServiceWorkerUpdateStatus(value: unknown): value is ServiceWorkerUpdateStatus {
  if (typeof value !== 'object' || value === null) return false;
  const status = value as Partial<ServiceWorkerUpdateStatus>;
  return (
    typeof status.currentClientIsStale === 'boolean' && typeof status.hasOtherClients === 'boolean'
  );
}

/**
 * A fresh foreground client already loaded the new network-first content. Reloading it only helps
 * when another tab still holds the old app open, or when this client really was built earlier than
 * the waiting worker.
 */
export function shouldPromptForServiceWorkerUpdate(status: ServiceWorkerUpdateStatus): boolean {
  return status.currentClientIsStale || status.hasOtherClients;
}
