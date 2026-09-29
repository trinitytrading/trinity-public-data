/**
 * Ship in a Bottle.
 * No request is made to trinitytrading.xyz. The wallet signs an unlock that
 * the onion program already knows. The sun is not an account in it.
 */
const PROGRAM = "3xoMKKSvoRMiMHUtK33UucNJ9isW2rGzn7eQqcT9BjfG";
const SUN = "9k5gfT6vPRsXDL8URjf5SNPmbjsZmDbS6xZuYdV5e31V";
const RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
const statusEl = document.querySelector("#status");
const connectButton = document.querySelector("#connect");
const unlockButton = document.querySelector("#unlock");

let wallet = "";
let busy = false;
let vessel = null;
let lamports = 0;

function say(text) {
  statusEl.textContent = text;
}

function provider() {
  const root = globalThis;
  if (root.phantom?.solana?.isPhantom) return root.phantom.solana;
  if (root.solflare?.isSolflare) return root.solflare;
  if (root.solana?.isPhantom || root.solana?.isSolflare) return root.solana;
  if (root.solana?.connect) return root.solana;
  return null;
}

function addressOf(signer) {
  const key = signer?.publicKey;
  return typeof key === "string" ? key : key?.toBase58?.() || "";
}

async function withRpc(run) {
  let last = new Error("Solana could not be read. Nothing was signed.");
  for (const url of RPCS) {
    try {
      return await run(new globalThis.solanaWeb3.Connection(url, "confirmed"));
    } catch (error) {
      if (error?.closed) throw error;
      last = error;
    }
  }
  throw last;
}

function refuse(message) {
  const error = new Error(message);
  error.closed = true;
  return error;
}

async function look() {
  vessel = null;
  lamports = 0;
  if (!wallet || wallet === SUN || !globalThis.solanaWeb3) {
    unlockButton.disabled = true;
    unlockButton.textContent = "No onion";
    say(wallet === SUN
      ? "The sun cannot unlock an onion. Nothing will be signed."
      : "Connect a wallet. Nothing will be signed until an onion is found.");
    return;
  }
  const web3 = globalThis.solanaWeb3;
  const owner = new web3.PublicKey(wallet);
  const program = new web3.PublicKey(PROGRAM);
  const [pda] = web3.PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("onion"), owner.toBytes()],
    program,
  );
  const info = await withRpc((connection) => connection.getAccountInfo(pda, "confirmed"));
  if (!info || !info.owner.equals(program) || info.data.length < 136) {
    unlockButton.disabled = true;
    unlockButton.textContent = "No onion";
    say(`No onion is open for this wallet. Nothing will be signed. The address would be ${pda.toBase58()}.`);
    return;
  }
  vessel = pda;
  lamports = info.lamports;
  unlockButton.disabled = busy;
  unlockButton.textContent = "Unlock and return SOL";
  const sol = info.lamports / 1_000_000_000;
  say(`Onion ${pda.toBase58()} holds ${sol} SOL. Unlock returns all of it and closes the onion. The sun is not paid.`);
}

connectButton.addEventListener("click", async () => {
  const signer = provider();
  if (!signer) {
    say("Open this page in Phantom or Solflare at http://127.0.0.1:8789/. Nothing was signed.");
    return;
  }
  if (typeof signer.connect === "function") await signer.connect();
  wallet = addressOf(signer);
  await look();
});

unlockButton.addEventListener("click", async () => {
  if (unlockButton.disabled || busy || !vessel || !wallet || wallet === SUN) return;
  busy = true;
  unlockButton.disabled = true;
  try {
    const web3 = globalThis.solanaWeb3;
    const signer = provider();
    if (!signer) throw refuse("Open this page in Phantom or Solflare. Nothing was signed.");
    const ix = new web3.TransactionInstruction({
      programId: new web3.PublicKey(PROGRAM),
      keys: [
        { pubkey: new web3.PublicKey(wallet), isSigner: true, isWritable: true },
        { pubkey: vessel, isSigner: false, isWritable: true },
      ],
      data: Uint8Array.of(7),
    });
    const sent = await withRpc(async (connection) => {
      const before = await connection.getAccountInfo(vessel, "confirmed");
      if (!before || before.lamports === 0) throw refuse("The onion is already empty. Nothing was signed.");
      const tx = new web3.Transaction();
      tx.feePayer = new web3.PublicKey(wallet);
      tx.add(ix);
      const sim = await connection.simulateTransaction(tx, undefined, [vessel]);
      if (sim?.value?.err) throw refuse("Unlock would not return the SOL. Nothing was signed.");
      const after = BigInt(sim?.value?.accounts?.[0]?.lamports ?? 0);
      if (after !== 0n) throw refuse("Unlock would not close the onion. Nothing was signed.");
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      return { connection, tx };
    });
    let signature;
    if (typeof signer.signAndSendTransaction === "function") {
      const result = await signer.signAndSendTransaction(sent.tx);
      signature = typeof result === "string" ? result : result?.signature;
    } else if (typeof signer.signTransaction === "function") {
      const signed = await signer.signTransaction(sent.tx);
      signature = await sent.connection.sendRawTransaction(signed.serialize());
    } else {
      throw refuse("This wallet cannot sign. Nothing was signed.");
    }
    if (!signature) throw refuse("The wallet did not return a signature.");
    say(`Unlocked ${signature}. The SOL is back in your wallet.`);
    vessel = null;
  } catch (error) {
    say(error?.message || "Nothing was signed.");
  } finally {
    busy = false;
    await look();
  }
});
