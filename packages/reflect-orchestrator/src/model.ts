import {generate} from '@rocicorp/rails';
import type {ReadTransaction, WriteTransaction} from '@rocicorp/reflect';
import * as v from '@badrap/valita';
import {OrchestrationOptions} from './options.js';

export type RoomAssignment = {
  roomID: string;
  userNumber: number;
};

const roomIndexToRoomID = (index: number) =>
  `orchestrator-assigned-${index.toString(10).padStart(10, '0')}`;

const roomSchema = v.object({
  id: v.string(),
  userNumbers: v.array(v.number()),
});

export const userRoomAssignmentSchema = v.object({
  id: v.string(),
  // foreign key to a roomSchema
  roomID: v.string(),
  clientIDs: v.array(v.string()),
  aliveTimestamp: v.number(),
  userNumber: v.number(),
});

const userRoomAssignmentMetaSchema = v.object({
  lastGCTimestamp: v.number(),
});

// Export generated interface.
export type UserRoomAssignment = v.Infer<typeof userRoomAssignmentSchema>;
type UserRoomAssignmentMeta = v.Infer<typeof userRoomAssignmentMetaSchema>;

const {get: getRoom, set: setRoom} = generate(
  'room',
  roomSchema.parse.bind(roomSchema),
);

const {
  get: getUserRoomAssignmentInternal,
  set: setUserRoomAssignment,
  update: updateUserRoomAssignment,
  delete: deleteUserRoomAssignment,
  list: listUserRoomAssignments,
} = generate(
  'userToRoom',
  userRoomAssignmentSchema.parse.bind(userRoomAssignmentSchema),
);

export const getUserRoomAssignment = getUserRoomAssignmentInternal;

const userRoomAssignmentMetaKey = 'userToRoomMeta';
async function getUserRoomAssignmentMeta(
  tx: ReadTransaction,
): Promise<UserRoomAssignmentMeta | undefined> {
  const meta = await tx.get(userRoomAssignmentMetaKey);
  if (meta === undefined) {
    return meta;
  }
  return userRoomAssignmentMetaSchema.parse(meta);
}

async function setUserRoomAssignmentMeta(
  tx: WriteTransaction,
  meta: UserRoomAssignmentMeta,
) {
  await tx.set(userRoomAssignmentMetaKey, meta);
}

async function removeUsersFromRoom(
  tx: WriteTransaction,
  roomID: string,
  removeUserNumbers: number[],
) {
  const room = await getRoom(tx, roomID);
  if (!room) {
    return;
  }
  const updatedUserNumbers = [];
  for (const userNumber of room.userNumbers) {
    if (removeUserNumbers.indexOf(userNumber) === -1) {
      updatedUserNumbers.push(userNumber);
    }
  }
  await setRoom(tx, {
    id: roomID,
    userNumbers: updatedUserNumbers,
  });
}

async function unload(tx: WriteTransaction) {
  if (tx.location !== 'server') {
    return;
  }
  if (tx.auth === undefined) {
    throw new Error('Unexpected missing transaction auth.');
  }

  const assignment = await getUserRoomAssignment(tx, tx.auth.userID);
  if (assignment !== undefined) {
    if (
      assignment.clientIDs.length === 1 &&
      assignment.clientIDs[0] === tx.clientID
    ) {
      await Promise.all([
        await removeUsersFromRoom(tx, assignment.roomID, [
          assignment.userNumber,
        ]),
        await deleteUserRoomAssignment(tx, assignment.id),
      ]);
    } else if (assignment.clientIDs.indexOf(tx.clientID) !== -1) {
      const updatedClientIDs = [...assignment.clientIDs];
      updatedClientIDs.splice(assignment.clientIDs.indexOf(tx.clientID), 1);
      await updateUserRoomAssignment(tx, {
        ...assignment,
        clientIDs: updatedClientIDs,
      });
    }
  }
}

function getFirstUnusedUserNumber(used: number[]): number {
  let unused = undefined;
  for (let i = 0; unused === undefined; i++) {
    if (used.indexOf(i) === -1) {
      unused = i;
    }
  }
  return unused;
}

export type OrchestrationMutators = {
  alive: (tx: WriteTransaction) => Promise<void>;
  unload: (tx: WriteTransaction) => Promise<void>;
};

export function createOrchestrationMutators(
  options: OrchestrationOptions,
): OrchestrationMutators {
  const {maxUsersPerRoom, roomAssignmentTimeoutMs = 30_000} = options;
  async function alive(tx: WriteTransaction) {
    if (tx.location !== 'server') {
      return;
    }
    if (tx.auth === undefined) {
      throw new Error('Unexpected missing transaction auth.');
    }

    const now = Date.now();
    const clientRoomAssignmentMeta = await getUserRoomAssignmentMeta(tx);
    if (
      clientRoomAssignmentMeta === undefined ||
      now - clientRoomAssignmentMeta.lastGCTimestamp >
        roomAssignmentTimeoutMs * 3
    ) {
      await setUserRoomAssignmentMeta(tx, {lastGCTimestamp: now});
      // GC room assignments
      const assignments = await listUserRoomAssignments(tx);
      const toDelete = [];
      const removeUserNumbers = new Map();
      for (const assignment of assignments) {
        if (now - assignment.aliveTimestamp > roomAssignmentTimeoutMs) {
          toDelete.push(assignment);
          removeUserNumbers.set(assignment.roomID, [
            ...(removeUserNumbers.get(assignment.roomID) ?? []),
            assignment.userNumber,
          ]);
        }
      }
      await Promise.all(
        toDelete.map(assignment => deleteUserRoomAssignment(tx, assignment.id)),
      );
      await Promise.all(
        [...removeUserNumbers.entries()].map(async ([roomID, change]) => {
          await removeUsersFromRoom(tx, roomID, change);
        }),
      );
    }
    const userRoomAssignment = await getUserRoomAssignment(tx, tx.auth.userID);
    if (userRoomAssignment !== undefined) {
      await updateUserRoomAssignment(tx, {
        id: userRoomAssignment.id,
        clientIDs:
          userRoomAssignment.clientIDs.indexOf(tx.clientID) === -1
            ? [...userRoomAssignment.clientIDs, tx.clientID]
            : userRoomAssignment.clientIDs,
        aliveTimestamp: now,
      });
      return;
    }
    let roomAssigned = false;
    for (let roomIndex = 0; !roomAssigned; roomIndex++) {
      const roomID = roomIndexToRoomID(roomIndex);
      const room = (await getRoom(tx, roomID)) ?? {
        id: roomID,
        userNumbers: [],
      };
      if (room.userNumbers.length < maxUsersPerRoom) {
        const userNumber = getFirstUnusedUserNumber(room.userNumbers);
        await setRoom(tx, {
          id: roomID,
          userNumbers: [...room.userNumbers, userNumber],
        });
        await setUserRoomAssignment(tx, {
          id: tx.auth.userID,
          roomID,
          clientIDs: [tx.clientID],
          aliveTimestamp: now,
          userNumber,
        });
        roomAssigned = true;
      }
    }
  }

  return {
    alive,
    unload,
  };
}
