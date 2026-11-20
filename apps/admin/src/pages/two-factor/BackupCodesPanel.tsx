// The 10 backup codes, shown once (Figma 6899:32707 / 6899:32759 at sign-in, 6902:33104 in the
// profile card). The caller decides what "Continue" does; the codes live only in React state and
// are never written to storage. `Continue` stays disabled until the operator confirms they have
// saved the codes: the codes cannot be shown again.
import { useState } from "react";
import { BACKUP_BODY, COPY_CODES, SAVED_CODES_LABEL } from "./twoFactorCopy";
import { copyText } from "./copyText";

// 10 characters, shown in two groups of 5 (the hyphen is display only; the server accepts it or a space).
export function formatBackupCode(code: string): string {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

interface Props {
  codes: string[];
  /** The explanatory sentence under the heading (differs between sign-in and regenerate). */
  body?: string;
  continueLabel: string;
  onContinue: () => void;
}

export default function BackupCodesPanel({ codes, body = BACKUP_BODY, continueLabel, onContinue }: Props) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(codes.map(formatBackupCode).join("\n"));
    if (ok) setCopied(true);
  };

  return (
    <>
      <p className="tf-text">{body}</p>
      <ul className="tf-codes" aria-label="Backup codes">
        {codes.map((code) => (
          <li key={code} className="tf-codes__item">
            {formatBackupCode(code)}
          </li>
        ))}
      </ul>
      <button type="button" className="tf-btn tf-btn--outline" onClick={() => void handleCopy()}>
        {copied ? "Copied" : COPY_CODES}
      </button>
      <label className="tf-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>{SAVED_CODES_LABEL}</span>
      </label>
      <button type="button" className="tf-btn tf-btn--primary" disabled={!saved} onClick={onContinue}>
        {continueLabel}
      </button>
    </>
  );
}
