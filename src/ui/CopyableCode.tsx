import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

/** A copy-paste example with a Copy button. */
export function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. insecure context): the code stays selectable.
    }
  };

  return (
    <div className="code">
      <div className="code-bar">
        <span>Example</span>
        <button type="button" className="code-copy" onClick={copy}>
          {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
      <span className="visually-hidden" role="status">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}
