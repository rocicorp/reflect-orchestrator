import {Reflect, ReflectOptions} from '@rocicorp/reflect/client';
import {OrchestrationOptions} from './options.js';
import {
  RoomAssignment,
  createOrchestrationMutators,
  getRoomAssignmentInfo,
} from './model.js';
import {MutatorDefs} from '@rocicorp/reflect';

export function startOrchestration(
  reflectOptions: Omit<ReflectOptions<MutatorDefs>, 'mutators'>,
  orchestrationOptions: OrchestrationOptions,
  onRoomAssignmentChange: (assignment: RoomAssignment | undefined) => void,
) {
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
      return {
        roomID: roomAssignmentInfo.roomID,
        assignmentNumber: roomAssignmentInfo.assignmentNumber,
      };
    },
    {
      onData: result => {
        onRoomAssignmentChange(result);
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
