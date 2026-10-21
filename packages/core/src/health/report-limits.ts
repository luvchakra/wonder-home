/**
 * What an attached health report may be (story 21-012), with no imports, so a
 * client sheet can check a file before it is sent. The server checks again
 * from the bytes (`report-upload.ts`).
 */

/** What one Server Action body carries (`next.config.ts`), the same ceiling HomeSend's upload form promises. */
export const REPORT_MAX_BYTES = 4 * 1024 * 1024;

export const REPORT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";
