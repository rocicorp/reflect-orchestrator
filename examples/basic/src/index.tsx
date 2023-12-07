import {Reflect} from '@rocicorp/reflect/client';
import {nanoid} from 'nanoid';
import React, {useEffect, useState} from 'react';
import ReactDOM from 'react-dom/client';
import {getUserInfo} from './client-state.js';
import CursorField from './cursor-field.js';
import styles from './index.module.css';
import {mutators} from './mutators.js';
import {useCount} from './subscriptions.js';
import {orchestrationOptions} from './orchestration-options.js';
import {useOrchestration} from '@rocicorp/reflect-orchestrator';

const userID = nanoid();
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

  const [r, setR] = useState<Reflect<typeof mutators>>();
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
    const userInfo = getUserInfo(roomAssignment.clientNumber);
    void reflect.mutate.initClientState(userInfo);
    setR(reflect);
    return () => {
      void reflect?.close();
      setR(undefined);
    };
  }, [roomAssignment]);

  const count = useCount(r, incrementKey);

  const handleButtonClick = () => {
    void r?.mutate.increment({key: incrementKey, delta: 1});
  };
  // Render app.
  return (
    <div className={styles.container}>
      <img className={styles.logo} src="/reflect.svg" />
      <div className={styles.content}>
        {r ? (
          <>
            <div>roomID: {roomAssignment?.roomID}</div>
            <div>clientNumber: {roomAssignment?.clientNumber}</div>
            <div className={styles.count}>{count}</div>
            <button onClick={handleButtonClick}>Bonk</button>
            <CursorField r={r} />
          </>
        ) : (
          'Finding a room...'
        )}
      </div>
    </div>
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
