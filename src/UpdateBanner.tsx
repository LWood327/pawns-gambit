import { useEffect, useState } from 'react';

type Status = { state: 'downloading'; version?: string; percent: number } | { state: 'ready'; version: string };

declare global {
  interface Window {
    /** Present only in the installed desktop app (see electron/preload.cjs). */
    updates?: {
      onStatus: (cb: (s: Status) => void) => () => void;
      install: () => void;
    };
  }
}

/** A small notice in the corner when a new version is downloading or ready. */
export function UpdateBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [version, setVersion] = useState<string | undefined>();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return window.updates?.onStatus((s) => {
      if (s.version) setVersion(s.version);
      setStatus(s);
    });
  }, []);

  if (!status || dismissed) return null;

  return (
    <div className="update-banner" role="status">
      {status.state === 'downloading' ? (
        <p>
          Downloading version {version ?? 'update'}
          {status.percent > 0 ? ` (${status.percent}%)` : '…'}
        </p>
      ) : (
        <>
          <p>
            Version {status.version} is ready. Restart to update, or it installs next time you close the app.
          </p>
          <div className="update-actions">
            <button className="primary small" onClick={() => window.updates?.install()}>
              Restart now
            </button>
            <button className="text-btn" onClick={() => setDismissed(true)}>
              Later
            </button>
          </div>
        </>
      )}
    </div>
  );
}
