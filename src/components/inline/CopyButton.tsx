"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon } from "./icons";

// Small "copy to clipboard" icon button, sized to match the pencil-edit
// icon (see InlineEditField) so the two read as one family wherever they
// sit side by side. Used next to every displayed email address in the
// app -- Greg (2026-10-19) wants this specifically to speed up moving an
// address between Base Camp and another app (Gmail, Messages, etc.)
// without having to select/retype it by hand, "especially ... in the
// action list to move quickly and efficiently between platforms."
//
// Deliberately NOT hover-gated the way the pencil icon is (opacity-0
// until group-hover): hover doesn't exist on a touchscreen, and Greg's
// own stated use case is mobile ("move quickly... between platforms"
// reads as switching apps on a phone). Always visible at a quieter
// opacity, full opacity on hover/focus for desktop -- usable on both.
//
// Deliberately its own small component rather than baked into
// InlineEditField unconditionally: several email displays across the app
// are plain read-only text/mailto links with no inline-edit field at all
// (Action List, Candidates, event/play/company contact lists), so a
// standalone button that just takes the string to copy works everywhere,
// while InlineEditField also grows a `copyable` prop that composes this
// same component for the handful of email fields that ARE editable.
export default function CopyButton({
  value,
  className,
  iconClassName,
  label = "Copy email",
}: {
  value: string;
  className?: string;
  iconClassName?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context, etc.) --
      // fail silently rather than throw; the email is still visible and
      // selectable by hand either way.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied!" : label}
      className={
        "shrink-0 opacity-60 hover:opacity-100 focus-visible:opacity-100 transition-opacity " +
        (className ?? "")
      }
    >
      {copied ? (
        <CheckIcon className={"text-emerald-600 dark:text-emerald-400 " + (iconClassName ?? "w-3 h-3")} />
      ) : (
        <CopyIcon className={iconClassName ?? "w-3 h-3"} />
      )}
    </button>
  );
}
