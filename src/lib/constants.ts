// Shared fallback recipient for any outbound notification that would
// otherwise have nobody to send to (no booking agent, no manager/artist
// contact on file for the artist in question). Centralized here so every
// call site -- the public offer-intake notification, the approval-request
// email, and eventually contract-signature routing -- points at the same
// address instead of each hardcoding the literal string.
export const FALLBACK_NOTIFY_EMAIL = "gburroughs@theridgemusicgroup.com";
