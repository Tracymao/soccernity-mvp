// backend/b060-data-export (B-060; Decision Log #472 adopted default (g)). "Download my data" for the signed-in
// account holder. Every figure below that the founder did not state is a DEFAULT, founder-veto-able, borrowed from
// the place named next to it.

export const DATA_EXPORT_STATUSES = ['preparing', 'ready', 'failed'] as const;
export type DataExportStatus = (typeof DATA_EXPORT_STATUSES)[number];

// Where the JSON file lives: PRIVATE storage, under a prefix that is NOT one of the two the public address serves
// (post-media/ and profile-media/, B-265), so the file is never publicly fetchable even if the bucket's public
// address is misconfigured to serve more. Read back only by the server, for the owner.
export const DATA_EXPORT_STORAGE_PREFIX = 'data-export/';

// One successful request per account per 24 hours. DEFAULT, founder-veto-able (stated by the founder as a
// "borrowed default"; the same figure other per-day caps in this codebase use).
export const DATA_EXPORT_REQUEST_INTERVAL_HOURS = 24;

// The download works for 7 days after the file is ready. DEFAULT, founder-veto-able (borrowed).
export const DATA_EXPORT_RETENTION_DAYS = 7;

// A request still "preparing" after this long was lost (the process stopped while building it): the daily sweep
// marks it failed so the person can ask again. DEFAULT, founder-veto-able.
export const DATA_EXPORT_STALE_PREPARING_MINUTES = 60;

// Rows are read from the database this many at a time while the file is built. DEFAULT.
export const DATA_EXPORT_PAGE_SIZE = 500;

// The file the browser saves.
export const DATA_EXPORT_FILE_NAME = 'soccernity-data-export.json';
export const DATA_EXPORT_FORMAT = 'soccernity-data-export';
export const DATA_EXPORT_FORMAT_VERSION = 1;

// Coded errors (the web client branches on `code`, never on the message).
export const DATA_EXPORT_WRONG_PASSWORD_CODE = 'wrong_password';
export const DATA_EXPORT_TOO_MANY_REQUESTS_CODE = 'too_many_requests';
export const DATA_EXPORT_NOT_FOUND_CODE = 'data_export_not_found';
export const DATA_EXPORT_NOT_READY_CODE = 'data_export_not_ready';
export const DATA_EXPORT_EXPIRED_CODE = 'data_export_expired';

// What GET /users/me/data-export/latest reports.
export type DataExportLatestStatus = 'none' | DataExportStatus;
