# Trinity onion API and SDK

A bot reads the API, builds an order with the SDK, and signs with its own wallet. This file never signs and never holds a key.

- API: https://trinitytrading.xyz/api/onion
- SDK: https://trinitytrading.xyz/onion/sdk/onion-sdk.mjs
- Page: https://trinitytrading.xyz/onion/sdk/

The program chooses a crank's card, amount, and destination. A house deposit chooses the USDC. Each 0.12 USDC also sends 0.00002 SOL so sailors can be paid. A house claim sends that seat's share of the cash. A JUP deposit chooses the JUP, and the program splits it 57 percent staked, 33 percent held, and 10 percent in the instant till. The sun cannot sign.

```js
import {
  readOnion,
  houseDeposit,
  houseClaim,
  houseCrank,
  delegatedCrank,
  jupDeposit,
  ready,
} from "https://trinitytrading.xyz/onion/sdk/onion-sdk.mjs";

const live = await readOnion();
const order = houseDeposit(web3, { owner, usdc: "0.50" });
const tx = await ready(web3, connection, owner, order);
const signed = await wallet.signTransaction(tx);
```

`houseCrank` takes only the sailor. `delegatedCrank` takes the sailor and the vessel the API listed. Passing an amount, a mark, or a destination throws, and nothing is signed.

A bug bounty is separate. Screenshot the problem, post it on X with @TrinityTradeAI and the bug. The first accepted report for a wallet pays 0.00001 SOL, two network fees. One wallet, once. The sun does not pay it.
