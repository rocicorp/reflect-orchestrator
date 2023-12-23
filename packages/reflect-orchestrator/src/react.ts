import {ReflectOptions} from '@rocicorp/reflect/client';
import {OrchestrationOptions, validateOptions} from './options.js';
import {useEffect, useState} from 'react';
import {MutatorDefs} from '@rocicorp/reflect';
import {RoomAssignment, startOrchestration} from './start.js';

export function useOrchestration(
  reflectOptions: Omit<ReflectOptions<MutatorDefs>, 'mutators'>,
  orchestrationOptions: OrchestrationOptions,
): RoomAssignment | undefined {
  validateOptions(orchestrationOptions);
  const [roomAssignment, setRoomAssignment] = useState<
    RoomAssignment | undefined
  >();
  useEffect(
    () =>
      startOrchestration(reflectOptions, orchestrationOptions, assignment => {
        setRoomAssignment(assignment);
      }),
    [],
  );
  return roomAssignment;
}
