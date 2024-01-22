# Problem

For some experiences it can be useful to limit the number of collaborators in a room.

Imagine a board game that has a limit of six players. If a seventh player tries to join, they should be put into a separate room. If a player leaves, the next player should take the empty spot.

Overflowing users into other rooms is complex because you don't want to have to try multiple rooms in sequence, as that would dramatically slow down connection. But you also don't want a bunch of mostly empty rooms.

# Solution

`reflect-orchestrator` maintains a dedicated room just for the purpose of distributing users. It keeps precise track of which users are in which rooms so that it can completely fill rooms before overflowing. Only one round trip to the orchestrator is required before a user can connect to their assigned rooms.

`reflect-orchestrator` handles all the ways in which a user could leave a room including tab-close, tab-switch, navigation, offline, and crashes.

# Demo

https://orchestrate.reflect.net/

Open this URL in multiple incognito windows. Each connection is assigned a unique _assignment number_ between 0 and limit-1. The assignment number can be used to assign clients cursor colors, avatars, etc.

In this demo the max clients per room is configured to 5. If more than five clients are present together, the sixth client will overflow into a new room.

# Installation

```bash
npm install reflect-orchestrator
```

# Running the Example

1. **Clone this repo**

   ```bash
   git clone git@github.com:rocicorp/reflect-orchestrator.git
   cd reflect-orchestrator
   ```

1. **Install dependencies**

   ```bash
   npm install
   ```

1. **Build the project**

   ```bash
   npm run build
   ```

1. **Navigate to the example directory**

   ```bash
   cd examples/basic
   ```

1. **Start the example**
   ```bash
   npm run watch
   ```

# Publishing Your Project

To publish your project with Reflect and deploy the UI:

1. **Publish the Reflect server**

   ```bash
   npx reflect publish
   ```

2. **Deploy the UI (Example: using Vercel)**
   ```bash
   npx vercel
   ```
