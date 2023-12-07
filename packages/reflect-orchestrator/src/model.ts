import {generate} from '@rocicorp/rails';
import type {ReadTransaction, WriteTransaction} from '@rocicorp/reflect';
import * as v from '@badrap/valita';
import {OrchestrationOptions} from './options.js';

export type RoomAssignment = {
  roomID: string;
  clientNumber: number;
};

const roomIndexToRoomID = (index: number) =>
  `orchestrator-assigned-${index.toString(10).padStart(10, '0')}`;

const roomSchema = v.object({
  id: v.string(),
  clientNumbers: v.array(v.number()),
});

export const clientRoomAssignmentSchema = v.object({
  id: v.string(),
  // foreign key to a roomModelSchema
  roomID: v.string(),
  aliveTimestamp: v.number(),
  clientNumber: v.number(),
});

const clientRoomAssignmentMetaSchema = v.object({
  lastGCTimestamp: v.number(),
});

// Export generated interface.
export type ClientRoomAssignment = v.Infer<typeof clientRoomAssignmentSchema>;
type ClientRoomAssignmentMeta = v.Infer<typeof clientRoomAssignmentMetaSchema>;

const {get: getRoom, put: putRoom} = generate(
  'room',
  roomSchema.parse.bind(roomSchema),
);

const {
  get: getClientRoomAssignmentInternal,
  put: putClientRoomAssignment,
  update: updateClientRoomAssignment,
  delete: deleteClientRoomAssignment,
  list: listClientRoomAssignments,
} = generate(
  'clientToRoom',
  clientRoomAssignmentSchema.parse.bind(clientRoomAssignmentSchema),
);

export const getClientRoomAssignment = getClientRoomAssignmentInternal;

const clientRoomAssignmentMetaKey = 'clientToRoomMeta';
async function getClientRoomAssignmentMeta(
  tx: ReadTransaction,
): Promise<ClientRoomAssignmentMeta | undefined> {
  const meta = await tx.get(clientRoomAssignmentMetaKey);
  if (meta === undefined) {
    return meta;
  }
  return clientRoomAssignmentMetaSchema.parse(meta);
}

async function putClientRoomAssignmentMeta(
  tx: WriteTransaction,
  meta: ClientRoomAssignmentMeta,
) {
  await tx.set(clientRoomAssignmentMetaKey, meta);
}

async function removeClientsFromRoom(
  tx: WriteTransaction,
  roomID: string,
  removeClientNumbers: number[],
) {
  const room = await getRoom(tx, roomID);
  if (!room) {
    return;
  }
  const updatedClientNumbers = [];
  for (const clientNumber of room.clientNumbers) {
    if (removeClientNumbers.indexOf(clientNumber) === -1) {
      updatedClientNumbers.push(clientNumber);
    }
  }
  await putRoom(tx, {
    id: roomID,
    clientNumbers: updatedClientNumbers,
  });
}

async function unload(tx: WriteTransaction) {
  if (tx.location !== 'server') {
    return;
  }
  const assignment = await getClientRoomAssignment(tx, tx.clientID);
  if (assignment !== undefined) {
    await Promise.all([
      await removeClientsFromRoom(tx, assignment.roomID, [
        assignment.clientNumber,
      ]),
      await deleteClientRoomAssignment(tx, assignment.id),
    ]);
  }
}

function getFirstUnusedClientNumber(used: number[]): number {
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
  const {maxClientsPerRoom, roomAssignmentTimeoutMs = 30_000} = options;
  async function alive(tx: WriteTransaction) {
    if (tx.location !== 'server') {
      return;
    }

    const now = Date.now();
    const clientRoomAssignmentMeta = await getClientRoomAssignmentMeta(tx);
    if (
      clientRoomAssignmentMeta === undefined ||
      now - clientRoomAssignmentMeta.lastGCTimestamp >
        roomAssignmentTimeoutMs * 3
    ) {
      await putClientRoomAssignmentMeta(tx, {lastGCTimestamp: now});
      // GC room assignments
      const assignments = await listClientRoomAssignments(tx);
      const toDelete = [];
      const removeClientNumbers = new Map();
      for (const assignment of assignments) {
        if (now - assignment.aliveTimestamp > roomAssignmentTimeoutMs) {
          toDelete.push(assignment);
          removeClientNumbers.set(assignment.roomID, [
            ...(removeClientNumbers.get(assignment.roomID) ?? []),
            assignment.clientNumber,
          ]);
        }
      }
      await Promise.all(
        toDelete.map(assignment =>
          deleteClientRoomAssignment(tx, assignment.id),
        ),
      );
      await Promise.all(
        [...removeClientNumbers.entries()].map(async ([roomID, change]) => {
          await removeClientsFromRoom(tx, roomID, change);
        }),
      );
    }
    const clientRoomAssignment = await getClientRoomAssignment(tx, tx.clientID);
    if (clientRoomAssignment !== undefined) {
      await updateClientRoomAssignment(tx, {
        id: clientRoomAssignment.id,
        aliveTimestamp: now,
      });
      return;
    }
    let roomAssigned = false;
    for (let roomIndex = 0; !roomAssigned; roomIndex++) {
      const roomID = roomIndexToRoomID(roomIndex);
      const room = (await getRoom(tx, roomID)) ?? {
        id: roomID,
        clientNumbers: [],
      };
      if (room.clientNumbers.length < maxClientsPerRoom) {
        const clientNumber = getFirstUnusedClientNumber(room.clientNumbers);
        await putRoom(tx, {
          id: roomID,
          clientNumbers: [...room.clientNumbers, clientNumber],
        });
        await putClientRoomAssignment(tx, {
          id: tx.clientID,
          roomID,
          aliveTimestamp: now,
          clientNumber,
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
