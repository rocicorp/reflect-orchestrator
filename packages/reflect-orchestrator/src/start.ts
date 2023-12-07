import {Reflect, ReflectOptions} from '@rocicorp/reflect/client';
import {OrchestrationOptions} from './options.js';
import {createOrchestrationMutators, getClientRoomAssignment} from './model.js';
import {MutatorDefs} from '@rocicorp/reflect';

export function startOrchestration(
  reflectOptions: Omit<ReflectOptions<MutatorDefs>, 'mutators'>,
  orchestrationOptions: OrchestrationOptions,
  onRoomAssignmentChange: (
    assignment:
      | {
          roomID: string;
          clientNumber: number;
        }
      | undefined,
  ) => void,
) {
  const orchestratorR = new Reflect({
    ...reflectOptions,
    mutators: {
      ...createOrchestrationMutators(orchestrationOptions),
    },
  });

  orchestratorR.subscribe(
    async tx => {
      const clientRoomAssignment = await getClientRoomAssignment(
        tx,
        tx.clientID,
      );
      if (!clientRoomAssignment) {
        return undefined;
      }
      return {
        roomID: clientRoomAssignment.roomID,
        clientNumber: clientRoomAssignment.clientNumber,
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
