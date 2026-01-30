import { prisma } from './db'

/**
 * Check if a user has access to a specific meeting
 * Access is granted if: user owns the meeting OR user has a share record
 */
export async function checkMeetingAccess(meetingId: string, userId: string): Promise<boolean> {
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      OR: [
        { userId: userId },
        { shares: { some: { userId: userId } } }
      ]
    },
    select: { id: true }
  })

  return meeting !== null
}

/**
 * Get all meeting IDs that a user can access
 * Returns IDs of meetings the user owns + meetings shared with the user
 */
export async function getAccessibleMeetingIds(userId: string): Promise<string[]> {
  // Get meetings owned by user
  const ownedMeetings = await prisma.meeting.findMany({
    where: { userId: userId },
    select: { id: true }
  })

  // Get meetings shared with user
  const sharedMeetings = await prisma.meetingShare.findMany({
    where: { userId: userId },
    select: { meetingId: true }
  })

  const ownedIds = ownedMeetings.map(m => m.id)
  const sharedIds = sharedMeetings.map(s => s.meetingId)

  // Combine and deduplicate
  const allIds = [...ownedIds, ...sharedIds]
  return Array.from(new Set(allIds))
}
