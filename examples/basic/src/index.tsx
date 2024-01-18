import {Reflect} from '@rocicorp/reflect/client';
import {nanoid} from 'nanoid';
import React, {useEffect, useState} from 'react';
import ReactDOM from 'react-dom/client';
import {getUserInfo} from './client-state.js';
import CursorField from './cursor-field.js';
import styles from './index.module.css';
import {M, mutators} from './mutators.js';
import {useCount, useUniqueUserIDs} from './subscriptions.js';
import {orchestrationOptions} from './orchestration-options.js';
import {useOrchestration, RoomAssignment} from 'reflect-orchestrator';

function getUserID() {
  // We store the userID in localStorage so that it persists across page
  // refreshes.
  const userID = localStorage.getItem('userID');
  if (userID) {
    return userID;
  }
  const newUserID = nanoid();
  localStorage.setItem('userID', newUserID);
  return newUserID;
}

const userID = getUserID();
const incrementKey = 'count';

const server: string | undefined = import.meta.env.VITE_REFLECT_URL;
if (!server) {
  throw new Error('VITE_REFLECT_URL required');
}

function App() {
  const roomAssignment = useOrchestration(
    {
      server,
      roomID: 'orchestrator',
      userID,
      auth: userID,
    },
    orchestrationOptions,
  );

  const [r, setR] = useState<Reflect<M>>();
  useEffect(() => {
    if (!roomAssignment) {
      setR(undefined);
      return;
    }
    const reflect = new Reflect({
      server,
      roomID: roomAssignment.roomID,
      userID,
      auth: userID,
      mutators,
    });
    const userInfo = getUserInfo(userID, roomAssignment.assignmentNumber);
    void reflect.mutate.initClientState(userInfo);
    setR(reflect);
    return () => {
      void reflect.close();
      setR(undefined);
    };
  }, [roomAssignment?.roomID, roomAssignment?.assignmentNumber]);

  // Render app.
  return (
    <div className={styles.container}>
      <img className={styles.logo} src="/reflect.svg" />
      <div className={styles.content}>
        {!r || !roomAssignment ? (
          'Finding a room...'
        ) : (
          <Content r={r} roomAssignment={roomAssignment} />
        )}
      </div>
    </div>
  );
}

function Content({
  r,
  roomAssignment,
}: {
  r: Reflect<M>;
  roomAssignment: RoomAssignment;
}) {
  const count = useCount(r, incrementKey);
  const userIDs = useUniqueUserIDs(r);

  // Once we have enough players, lock the room.
  useEffect(() => {
    if (
      userIDs.length === orchestrationOptions.maxPerRoom &&
      !roomAssignment.roomIsLocked
    ) {
      roomAssignment.lockRoom();
    }
  }, [userIDs.length]);

  const handleButtonClick = () => {
    void r?.mutate.increment({key: incrementKey, delta: 1});
  };

  return (
    <>
      <div className={styles.roomAssignmentInfo}>
        <div>
          <span className={styles.label}>roomID:</span> {roomAssignment?.roomID}
        </div>
        <div>
          <span className={styles.label}>assignmentNumber:</span>{' '}
          {roomAssignment?.assignmentNumber}
        </div>
      </div>
      {userIDs.length < orchestrationOptions.maxPerRoom ? (
        <>
          <br />
          'Waiting for player...'
        </>
      ) : (
        <>
          <div className={styles.count}>{count}</div>
          <button onClick={handleButtonClick}>Bonk</button>
        </>
      )}
      <CursorField r={r} />
    </>
  );
}

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('root element is null');
}
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    root.unmount();
  });
}
