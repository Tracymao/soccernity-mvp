import { Injectable } from '@nestjs/common';

// backend/w3c-contest-notifications (B-122). The one contest fact the notification layer needs
// that has NO storage yet: "which finalists have already uploaded their final entry?" (the
// finalist upload reminder, event h, goes only to finalists who have not).
//
// The final-entry flag, the finalist-only upload portal and the upload window are B-091. Until
// they exist nobody CAN have uploaded a final entry, so the honest answer is the empty set, and
// every finalist is reminded. B-091 replaces the body of this one method; the sweep, the planner
// and the tests do not change. Kept as its own injectable so the specs can drive the "already
// uploaded" case today.
@Injectable()
export class ContestNotificationFacts {
  async getFinalEntryUserIds(_cycleId: string): Promise<Set<string>> {
    return new Set();
  }
}
