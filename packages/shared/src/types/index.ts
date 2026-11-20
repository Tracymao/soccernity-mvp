// Shared TypeScript types, mirroring services/api/prisma/schema.prisma.
//
// These should stay in lockstep with the Prisma schema (MVP Build Plan
// Section 3). If you're adding a field here that isn't in schema.prisma,
// add it there first -- this file describes the API's shape, it doesn't
// define it.

export interface User {
  id: string;
  email: string;
  displayName: string;
  // Optional, unique handle (stored lowercase). Other users see
  // username ?? displayName -- see services/api users/public-name.util.ts.
  username?: string | null;
  isMinor: boolean;
  role: "fan" | "player" | "admin";
  verificationStatus: string;
}

export interface Post {
  id: string;
  authorId: string;
  contentText: string;
  mediaUrls: string[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
}
