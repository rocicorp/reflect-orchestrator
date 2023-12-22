export type OrchestrationOptions = {
  /**
   * The maximum number of assignments a room can have at one time.
   *
   * When assignBy is 'client', each client counts as its own assignment,
   * when assignBy is 'user', all clients for the same userID count as a
   * single assignment.
   */
  maxPerRoom: number;

  /**
   * Whether assignments should be made by client or user. (i.e. all
   * clients for the same userID should have the same room assignment).
   *
   * assignBy 'user' requires an `authHandler` to be configured for
   * Authentication (see https://hello.reflect.net/how/auth).
   */
  assignBy: 'client' | 'user';

  /**
   * The amount of time a client/user can be disconnected before losing
   * their assignment to the room (if they reconnect after a long
   * time, for example a user switches back to a long backgrounded tab, they
   * will be reassigned a room, which may be a different room).
   *
   * Defaults to 30 seconds.
   */
  roomAssignmentTimeoutMs?: number;
};
