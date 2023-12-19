export type OrchestrationOptions = {
  /**
   * The maximum number of users that can be assigned to a room at one time.
   */
  maxUsersPerRoom: number;

  /**
   * The amount of time a client can be disconnected before losing
   * its assignment to the room (if the client reconnects after a long time,
   * for example a user switches back to a long backgrounded tab, the client
   * will be reassigned a room, which may be a different room).
   *
   * Defaults to 30 seconds.
   */
  roomAssignmentTimeoutMs?: number;
};
