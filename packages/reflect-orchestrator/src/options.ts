export type OrchestrationOptions = {
  /**
   * Whether assignments should be made by client or user. (i.e. all
   * clients for the same userID should have the same room assignment).
   *
   * assignBy 'user' requires an `authHandler` to be configured for
   * Authentication (see https://hello.reflect.net/how/auth).
   */
  assignBy: 'client' | 'user';

  /**
   * The maximum number of assignments a room can have at one time.
   *
   * When assignBy is 'client', each client counts as its own assignment,
   * when assignBy is 'user', all clients for the same userID count as a
   * single assignment.
   *
   * Must be > 0.
   */
  maxPerRoom: number;

  /**
   * The amount of time a client/user can be disconnected before losing
   * their assignment to the room (if they reconnect after a long
   * time, for example a user switches back to a long backgrounded tab, they
   * will be reassigned a room, which may be a different room).
   *
   * Must be > 0.
   *
   * Defaults to 30 seconds.
   */
  assignmentTimeoutMs?: number;

  /**
   * Assigned roomIDs will have the format:
   * `${roomIDPrefix}-${index.toString(10).padStart(10, '0')}`
   *
   * Must be non-empty.
   *
   * Defaults to 'orchestrator-assigned'.
   */
  roomIDPrefix?: string;
};

export function validateOptions(orchOptions: OrchestrationOptions) {
  if (orchOptions.maxPerRoom <= 0) {
    throw new TypeError('OrchestrationOptions.maxPerRoom must be > 0.');
  }
  if (
    orchOptions.assignmentTimeoutMs !== undefined &&
    orchOptions.assignmentTimeoutMs <= 0
  ) {
    throw new TypeError(
      'OrchestrationOptions.assignmentTimeoutMs must be > 0.',
    );
  }
  if (
    orchOptions.roomIDPrefix !== undefined &&
    orchOptions.roomIDPrefix.length === 0
  ) {
    throw new TypeError('OrchestrationOptions.roomIDPrefix must be non-empty.');
  }
}
