// This file defines the ClientState entity that we use to track
// cursors. It also defines some basic CRUD functions using the
// @rocicorp/rails helper library.

import type {WriteTransaction} from '@rocicorp/reflect';
import {Entity, generate} from '@rocicorp/rails';

export type ClientState = Entity & {
  cursor: {x: number; y: number} | null;
  userInfo: UserInfo;
};

export type UserInfo = {
  name: string;
  avatar: string;
  color: string;
};

export {
  initClientState,
  getClientState,
  putClientState,
  updateClientState,
  getUserInfo,
};

const {
  init: initImpl,
  get: getClientState,
  put: putClientState,
  update: updateClientState,
} = generate<ClientState>('client-state');

function initClientState(tx: WriteTransaction, userInfo: UserInfo) {
  return initImpl(tx, {
    id: tx.clientID,
    cursor: null,
    userInfo,
  });
}

function getUserInfo(clientNumber: number): UserInfo {
  const [avatar, name, color] = userInfos[clientNumber % userInfos.length];
  return {
    avatar,
    name,
    color,
  };
}

const userInfos = [
  ['🐶', 'Puppy', '#f94144'],
  ['🐱', 'Kitty', '#f3722c'],
  ['🐭', 'Mouse', '#f8961e'],
  ['🐹', 'Hamster', '#f9844a'],
  ['🐰', 'Bunny', '#f9c74f'],
];
