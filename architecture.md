# System Architecture

```
+---------------------+        +---------------------+
|      Chain A        |        |      Chain B        |
|  (Settlement)       |        |  (Execution)        |
|                     |        |                     |
|  [VaultToken]       |        |  [WrappedVaultToken]|
|         |           |        |         ^           |
|         v           |        |         |           |
|  [BridgeLock] <----------+   |  [BridgeMint] <--------+
|    (Lock/Unlock)    |    |   |    (Mint/Burn)      |    |
|         |           |    |   |         |           |    |
|         |           |    |   |         |           |    |
|  [GovEmergency]     |    |   |  [GovVoting]        |    |
|    (Pause)          |    |   |    (Vote)           |    |
+---------^-----------+    |   +---------^-----------+    |
          |                |             |                |
          |                |             |                |
Events:   | Processed      |             | Events         |
Lock/Unlock                |             | Mint/Burn      |
Pause                      |             | Vote Passed    |
          |                |             |                |
          |                |             |                |
+---------+----------------+-------------+-------------+  |
|                     Relayer Service                  |  |
|                (Node.js + SQLite DB)                 |  |
|                                                      |  |
|  1. Listens to Chain A/B events                      |  |
|  2. Check DB for nonce (Replay Protection)           |  |
|  3. Call destination contract (Mint/Unlock/Pause)    |  |
|  4. Wait for 3 confirmations                         |  |
+------------------------------------------------------+  |
```

## Component Roles

### Chain A (Settlement)
- **VaultToken**: The native token being bridged.
- **BridgeLock**: The main entry point. Users deposit tokens here ("Lock"). Only the Relayer can withdraw tokens ("Unlock").
- **GovernanceEmergency**: Allows emergency actions (pausing BridgeLock) based on cross-chain messages.

### Chain B (Execution)
- **WrappedVaultToken**: Represents the bridged asset. Minted/Burned by BridgeMint.
- **BridgeMint**: Controls minting/burning. Only the Relayer can mint. Anyone can burn (to unlock on Chain A).
- **GovernanceVoting**: Allows users to vote on proposals. The "Pass" event triggers actions on Chain A.

### Relayer Service
- **Event Listening**: Monitors both chains for events.
- **Persistence**: Stores processed event nonces in SQLite to prevent replay attacks and resume after crashes.
- **Reliability**: Handles retries and waits for confirmations to ensure finality.
