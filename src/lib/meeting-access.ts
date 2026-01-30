import { prisma } from './db'

/**
 * Check if a user has access to a specific meeting
 * Access is granted if: user owns the meeting OR user has a share record (by email)
 */
export async function checkMeetingAccess(meetingId: string, userId: string): Promise<boolean> {
  // Get user's email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  })

  if (!user?.email) return false

  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      OR: [
        { userId: userId },
        { shares: { some: { sharedWith: user.email } } }
      ]
    },
    select: { id: true }
  })

  return meeting !== null
}

/**
 * Get all meeting IDs that a user can access
 * Returns IDs of meetings the user owns + meetings shared with the user (by email)
 */
export async function getAccessibleMeetingIds(userId: string): Promise<string[]> {
  // Get user's email
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  })

  // Get meetings owned by user
  const ownedMeetings = await prisma.meeting.findMany({
    where: { userId: userId },
    select: { id: true }
  })

  const ownedIds = ownedMeetings.map(m => m.id)

  // Get meetings shared with user (by email)
  if (user?.email) {
    const sharedMeetings = await prisma.meetingShare.findMany({
      where: { sharedWith: user.email },
      select: { meetingId: true }
    })
    const sharedIds = sharedMeetings.map(s => s.meetingId)

    // Combine and deduplicate
    const allIds = [...ownedIds, ...sharedIds]
    return Array.from(new Set(allIds))
  }

  return ownedIds
}
