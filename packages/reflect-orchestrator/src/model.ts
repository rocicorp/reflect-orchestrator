import {generate} from '@rocicorp/rails';
import type {ReadTransaction, WriteTransaction} from '@rocicorp/reflect';
import * as v from '@badrap/valita';
import {OrchestrationOptions} from './options.js';

export type RoomAssignment = {
  roomID: string;
  assignmentNumber: number;
};

const SCHEMA_VERSION = 'v1';
function makeKeyPrefix(prefix: string): string {
  return `reflect-orchestrator/${SCHEMA_VERSION}/${prefix}`;
}

const roomIndexToRoomID = (index: number) =>
  `orchestrator-assigned-${index.toString(10).padStart(10, '0')}`;

const roomSchema = v.object({
  id: v.string(),
  assignmentNumbers: v.array(v.number()),
});

export const roomAssignmentInfoSchema = v.object({
  // clientID if assignBy 'client', userID if assignBy 'user'
  id: v.string(),
  // foreign key to a roomSchema
  roomID: v.string(),
  // length 0-1 if assignBy 'client', length >= 0 if assignBy 'user'
  clientIDs: v.array(v.string()),
  aliveTimestamp: v.number(),
  assignmentNumber: v.number(),
});

const roomAssignmentsMetaSchema = v.object({
  lastGCTimestamp: v.number(),
});

// Export generated interface.
export type RoomAssignmentInfo = v.Infer<typeof roomAssignmentInfoSchema>;
type RoomAssignmentsMeta = v.Infer<typeof roomAssignmentsMetaSchema>;

const {get: getRoom, set: setRoom} = generate(
  makeKeyPrefix('room'),
  roomSchema.parse.bind(roomSchema),
);

const {
  get: getRoomAssignmentInternal,
  set: setRoomAssignment,
  update: updateRoomAssignment,
  delete: deleteRoomAssignment,
  list: listRoomAssignments,
} = generate(
  makeKeyPrefix('roomAssignment'),
  roomAssignmentInfoSchema.parse.bind(roomAssignmentInfoSchema),
);

export const getRoomAssignmentInfo = getRoomAssignmentInternal;

const roomAssignmentMetaKey = makeKeyPrefix('roomAssignmentsMeta');
async function getRoomAssignmentsMeta(
  tx: ReadTransaction,
): Promise<RoomAssignmentsMeta | undefined> {
  const meta = await tx.get(roomAssignmentMetaKey);
  if (meta === undefined) {
    return meta;
  }
  return roomAssignmentsMetaSchema.parse(meta);
}

async function setRoomAssignmentMeta(
  tx: WriteTransaction,
  meta: RoomAssignmentsMeta,
) {
  await tx.set(roomAssignmentMetaKey, meta);
}

async function removeAssignmentsFromRoom(
  tx: WriteTransaction,
  roomID: string,
  removeAssignmentNumbers: number[],
) {
  const room = await getRoom(tx, roomID);
  if (!room) {
    return;
  }
  const assignmentNumbers = [];
  for (const assignmentNumber of room.assignmentNumbers) {
    if (removeAssignmentNumbers.indexOf(assignmentNumber) === -1) {
      assignmentNumbers.push(assignmentNumber);
    }
  }
  await setRoom(tx, {
    id: roomID,
    assignmentNumbers,
  });
}

function getFirstUnusedAssignmentNumber(used: number[]): number {
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
  const {maxPerRoom, assignmentTimeoutMs = 30_000} = options;
  async function alive(tx: WriteTransaction) {
    if (tx.location !== 'server') {
      return;
    }
    const id = getIdForAssignment(tx, options);
    const now = Date.now();
    const clientRoomAssignmentMeta = await getRoomAssignmentsMeta(tx);
    if (
      clientRoomAssignmentMeta === undefined ||
      now - clientRoomAssignmentMeta.lastGCTimestamp > assignmentTimeoutMs * 3
    ) {
      await setRoomAssignmentMeta(tx, {lastGCTimestamp: now});
      // GC room assignments
      const assignments = await listRoomAssignments(tx);
      const toDelete = [];
      const removeAssignmentNumbers = new Map();
      for (const assignment of assignments) {
        if (now - assignment.aliveTimestamp > assignmentTimeoutMs) {
          toDelete.push(assignment);
          removeAssignmentNumbers.set(assignment.roomID, [
            ...(removeAssignmentNumbers.get(assignment.roomID) ?? []),
            assignment.assignmentNumber,
          ]);
        }
      }
      await Promise.all(
        toDelete.map(assignment => deleteRoomAssignment(tx, assignment.id)),
      );
      await Promise.all(
        [...removeAssignmentNumbers.entries()].map(async ([roomID, change]) => {
          await removeAssignmentsFromRoom(tx, roomID, change);
        }),
      );
    }
    const roomAssignment = await getRoomAssignmentInfo(tx, id);
    if (roomAssignment !== undefined) {
      await updateRoomAssignment(tx, {
        id: roomAssignment.id,
        clientIDs:
          roomAssignment.clientIDs.indexOf(tx.clientID) === -1
            ? [...roomAssignment.clientIDs, tx.clientID]
            : roomAssignment.clientIDs,
        aliveTimestamp: now,
      });
      return;
    }
    let roomAssigned = false;
    for (let roomIndex = 0; !roomAssigned; roomIndex++) {
      const roomID = roomIndexToRoomID(roomIndex);
      const room = (await getRoom(tx, roomID)) ?? {
        id: roomID,
        assignmentNumbers: [],
      };
      if (room.assignmentNumbers.length < maxPerRoom) {
        const assignmentNumber = getFirstUnusedAssignmentNumber(
          room.assignmentNumbers,
        );
        await setRoom(tx, {
          id: roomID,
          assignmentNumbers: [...room.assignmentNumbers, assignmentNumber],
        });
        await setRoomAssignment(tx, {
          id,
          roomID,
          clientIDs: [tx.clientID],
          aliveTimestamp: now,
          assignmentNumber,
        });
        roomAssigned = true;
      }
    }
  }

  async function unload(tx: WriteTransaction) {
    if (tx.location !== 'server') {
      return;
    }
    const id = getIdForAssignment(tx, options);
    const assignment = await getRoomAssignmentInfo(tx, id);
    if (assignment !== undefined) {
      if (
        assignment.clientIDs.length === 1 &&
        assignment.clientIDs[0] === tx.clientID
      ) {
        await Promise.all([
          await removeAssignmentsFromRoom(tx, assignment.roomID, [
            assignment.assignmentNumber,
          ]),
          await deleteRoomAssignment(tx, assignment.id),
        ]);
      } else if (assignment.clientIDs.indexOf(tx.clientID) !== -1) {
        const updatedClientIDs = [...assignment.clientIDs];
        updatedClientIDs.splice(assignment.clientIDs.indexOf(tx.clientID), 1);
        await updateRoomAssignment(tx, {
          ...assignment,
          clientIDs: updatedClientIDs,
        });
      }
    }
  }

  return {
    alive,
    unload,
  };
}
function getIdForAssignment(
  tx: WriteTransaction,
  options: OrchestrationOptions,
) {
  if (options.assignBy === 'user') {
    if (tx.auth === undefined) {
      throw new Error(
        "The use of OrchestrationOptions.assignBy 'user', requires an authHandler be configured for Authentication",
      );
    }
    return tx.auth.userID;
  }
  return tx.clientID;
}
