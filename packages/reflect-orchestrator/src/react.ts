import {ReflectOptions} from '@rocicorp/reflect/client';
import {OrchestrationOptions} from './options.js';
import {useEffect, useState} from 'react';
import {MutatorDefs} from '@rocicorp/reflect';
import {startOrchestration} from './start.js';
import {RoomAssignment} from './model.js';

export function useOrchestration(
  reflectOptions: Omit<ReflectOptions<MutatorDefs>, 'mutators'>,
  orchestrationOptions: OrchestrationOptions,
): RoomAssignment | undefined {
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
