import {Reflect, ReflectOptions} from '@rocicorp/reflect/client';
import {OrchestrationOptions, validateOptions} from './options.js';
import {
  createOrchestrationMutators,
  getRoom,
  getRoomAssignmentInfo,
} from './model.js';
import {MutatorDefs} from '@rocicorp/reflect';

export type RoomAssignment = {
  roomID: string;
  assignmentNumber: number;
  roomIsLocked: boolean;
  /**
   * Locks the assigned `roomID`.
   * No new assignments will be made to a locked `roomID`.
   * Locking is performed on the server and only if the server agrees this
   * client is currently assigned to roomID.  If successful the `RoomAssignment`
   * will be updated with a `roomIsLocked` value of `true` (`roomID` and
   * `assignmentNumber` are not changed).
   */
  lockRoom: () => void;
};

export function startOrchestration(
  reflectOptions: Omit<ReflectOptions<MutatorDefs>, 'mutators'>,
  orchestrationOptions: OrchestrationOptions,
  onRoomAssignmentChange: (assignment: RoomAssignment | undefined) => void,
) {
  validateOptions(orchestrationOptions);
  const orchestratorR = new Reflect({
    ...reflectOptions,
    mutators: {
      ...createOrchestrationMutators(orchestrationOptions),
    },
  });

  orchestratorR.subscribe(
    async tx => {
      const roomAssignmentInfo = await getRoomAssignmentInfo(
        tx,
        orchestrationOptions.assignBy === 'user'
          ? orchestratorR.userID
          : orchestratorR.clientID,
      );
      if (!roomAssignmentInfo) {
        return undefined;
      }
      const room = await getRoom(tx, roomAssignmentInfo.roomID);
      if (!room) {
        return undefined;
      }
      return {
        roomID: roomAssignmentInfo.roomID,
        assignmentNumber: roomAssignmentInfo.assignmentNumber,
        roomIsLocked: room.isLocked ?? false,
      };
    },
    {
      onData: result => {
        onRoomAssignmentChange(
          result === undefined
            ? undefined
            : {
                ...result,
                lockRoom: () =>
                  orchestratorR.mutate.lockRoom({roomID: result?.roomID}),
              },
        );
      },
    },
  );
  const aliveIfVisible = () => {
    if (document.visibilityState === 'visible') {
      void orchestratorR.mutate.alive();
    }
  };
  aliveIfVisible();
  const ORCHESTRATOR_ALIVE_INTERVAL_MS = 10_000;
  const aliveInterval = setInterval(
    aliveIfVisible,
    ORCHESTRATOR_ALIVE_INTERVAL_MS,
  );
  const visibilityChangeListener = () => {
    aliveIfVisible();
  };
  document.addEventListener('visibilitychange', visibilityChangeListener);
  const pageHideListener = () => {
    void orchestratorR.mutate.unload();
  };
  window.addEventListener('pagehide', pageHideListener);

  return () => {
    clearInterval(aliveInterval);
    document.removeEventListener('visibilitychange', visibilityChangeListener);
    window.removeEventListener('pagehide', pageHideListener);
    void orchestratorR.close();
  };
}
