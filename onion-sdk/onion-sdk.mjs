/**
 * Trinity onion SDK.
 * Bots import this file. It reads the public API and builds orders.
 * The bot signs with its own wallet. This file never signs and never holds a key.
 * A crank's amount, mark, and destination come from the program.
 * A house deposit chooses the USDC. The sailor SOL is computed.
 */
export const API = "https://trinitytrading.xyz/api/onion";
export const SUN = "9k5gfT6vPRsXDL8URjf5SNPmbjsZmDbS6xZuYdV5e31V";

export const PROGRAMS = {
  house: "J2EWVBJzomgCDRXNDw91JLToGkqwKS439ynUg8xLuCsK",
  onion: "3xoMKKSvoRMiMHUtK33UucNJ9isW2rGzn7eQqcT9BjfG",
  jupPool: "DAk9Fj5S4H5qV2JTYePwk5dvaYUur2GK1cjAU4HBX7UW",
  price: "AvVBPJsuuwwN98nKpJpLwpJq1AKaM1ZvPxKjkc3DxEbV",
  jupiter: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  jup: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  associated: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  system: "11111111111111111111111111111111",
  voter: "voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj",
  locker: "CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN",
};

const STARTER = 120_000n;
const ROUND_FUEL = 20_000n;
const MIN_USDC = 10_000n;
const MIN_JUP = 100n;
const HOUSE_ACCOUNT = "cvyVve76Yq77dDr6TdUudfrkR3Ez7YY7oTspK1gCokp";

export function rawFromAmount(value, decimals = 6) {
  const text = String(value ?? "").trim();
  const scale = 10n ** BigInt(decimals);
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Amount must be a positive number.");
  const [whole, frac = ""] = text.split(".");
  if (frac.length > decimals) throw new Error("Too many decimal places.");
  return BigInt(whole) * scale + BigInt((frac + "0".repeat(decimals)).slice(0, decimals));
}

export function entryFuel(usdcRaw) {
  if (usdcRaw <= 0n) return 0n;
  const starters = (usdcRaw + STARTER - 1n) / STARTER;
  return starters * ROUND_FUEL;
}

export function splitJup(amount) {
  const stake = (amount * 57n) / 100n;
  const short = (amount * 33n) / 100n;
  const till = amount - stake - short;
  return { stake, short, till };
}

function refuseSun(owner) {
  if (!owner || String(owner) === SUN) throw new Error("The sun cannot sign this order.");
}

function onlyKeys(input, allowed) {
  const extra = Object.keys(input || {}).filter((key) => !allowed.includes(key));
  if (extra.length) throw new Error("The program chooses the card, the amount, and the destination.");
}

function key(web3, value) {
  return new web3.PublicKey(value);
}

function seed(text) {
  return new TextEncoder().encode(text);
}

function pda(web3, seeds, program) {
  return web3.PublicKey.findProgramAddressSync(seeds, key(web3, program))[0];
}

function ata(web3, owner, mint) {
  return pda(web3, [key(web3, owner).toBytes(), key(web3, PROGRAMS.token).toBytes(), key(web3, mint).toBytes()], PROGRAMS.associated);
}

function ix(web3, programId, keys, data) {
  return new web3.TransactionInstruction({ programId: key(web3, programId), keys, data });
}

function meta(web3, pubkey, writable, signer = false) {
  return { pubkey: key(web3, pubkey), isSigner: signer, isWritable: writable };
}

function u64Bytes(tag, amount) {
  const data = new Uint8Array(9);
  data[0] = tag;
  new DataView(data.buffer).setBigUint64(1, amount, true);
  return data;
}

function systemTransfer(web3, from, to, lamports) {
  const data = new Uint8Array(12);
  new DataView(data.buffer).setUint32(0, 2, true);
  new DataView(data.buffer).setBigUint64(4, lamports, true);
  return ix(web3, PROGRAMS.system, [
    meta(web3, from, true, true),
    meta(web3, to, true),
  ], data);
}

function createAta(web3, payer, owner, mint) {
  return ix(web3, PROGRAMS.associated, [
    meta(web3, payer, true, true),
    meta(web3, ata(web3, owner, mint), true),
    meta(web3, owner, false),
    meta(web3, mint, false),
    meta(web3, PROGRAMS.system, false),
    meta(web3, PROGRAMS.token, false),
  ], Uint8Array.of(1));
}

export async function readOnion(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(API, { cache: "no-store" });
  if (!response.ok) throw new Error("The onion API could not be read.");
  return response.json();
}

function boardOf(body) {
  if (body && typeof body.live === "object" && body.live) return body.live;
  return body || {};
}

export function houseDeposit(web3, input) {
  onlyKeys(input, ["owner", "usdc"]);
  const owner = String(input.owner || "");
  refuseSun(owner);
  const usdcRaw = rawFromAmount(input.usdc, 6);
  if (usdcRaw < MIN_USDC) throw new Error("The smallest house deposit is 0.01 USDC.");
  const fuel = entryFuel(usdcRaw);
  const house = pda(web3, [seed("house")], PROGRAMS.house);
  const seat = pda(web3, [seed("house-seat"), key(web3, owner).toBytes()], PROGRAMS.house);
  const source = ata(web3, owner, PROGRAMS.usdc);
  const vault = ata(web3, house, PROGRAMS.usdc);
  const instructions = [
    systemTransfer(web3, owner, house, fuel),
    createAta(web3, owner, owner, PROGRAMS.usdc),
    ix(web3, PROGRAMS.house, [
      meta(web3, owner, true, true),
      meta(web3, house, true),
      meta(web3, seat, true),
      meta(web3, source, true),
      meta(web3, vault, true),
      meta(web3, PROGRAMS.token, false),
      meta(web3, PROGRAMS.system, false),
    ], u64Bytes(2, usdcRaw)),
  ];
  return {
    kind: "house-deposit",
    owner,
    usdcRaw: usdcRaw.toString(),
    fuelLamports: fuel.toString(),
    house: house.toBase58(),
    instructions,
  };
}

export function houseClaim(web3, input) {
  onlyKeys(input, ["owner"]);
  const owner = String(input.owner || "");
  refuseSun(owner);
  const house = pda(web3, [seed("house")], PROGRAMS.house);
  const seat = pda(web3, [seed("house-seat"), key(web3, owner).toBytes()], PROGRAMS.house);
  const destination = ata(web3, owner, PROGRAMS.usdc);
  const vault = ata(web3, house, PROGRAMS.usdc);
  const instructions = [
    createAta(web3, owner, owner, PROGRAMS.usdc),
    ix(web3, PROGRAMS.house, [
      meta(web3, owner, true, true),
      meta(web3, house, true),
      meta(web3, seat, true),
      meta(web3, destination, true),
      meta(web3, vault, true),
      meta(web3, PROGRAMS.token, false),
    ], Uint8Array.of(3)),
  ];
  return { kind: "house-claim", owner, house: house.toBase58(), instructions };
}

export function jupDeposit(web3, input) {
  onlyKeys(input, ["owner", "jup"]);
  const owner = String(input.owner || "");
  refuseSun(owner);
  const amount = rawFromAmount(input.jup, 6);
  if (amount < MIN_JUP) throw new Error("The smallest JUP deposit is 0.0001 JUP.");
  const parts = splitJup(amount);
  const pool = pda(web3, [seed("jup-pool")], PROGRAMS.jupPool);
  const escrow = pda(web3, [seed("Escrow"), key(web3, PROGRAMS.locker).toBytes(), pool.toBytes()], PROGRAMS.voter);
  const seat = pda(web3, [seed("jup-seat"), key(web3, owner).toBytes()], PROGRAMS.jupPool);
  const source = ata(web3, owner, PROGRAMS.jup);
  const instructions = [
    createAta(web3, owner, owner, PROGRAMS.jup),
    ix(web3, PROGRAMS.jupPool, [
      meta(web3, owner, true, true),
      meta(web3, pool, true),
      meta(web3, seat, true),
      meta(web3, source, true),
      meta(web3, pda(web3, [seed("vault"), pool.toBytes()], PROGRAMS.jupPool), true),
      meta(web3, pda(web3, [seed("short"), pool.toBytes()], PROGRAMS.jupPool), true),
      meta(web3, pda(web3, [seed("till"), pool.toBytes()], PROGRAMS.jupPool), true),
      meta(web3, escrow, true),
      meta(web3, ata(web3, escrow, PROGRAMS.jup), true),
      meta(web3, PROGRAMS.locker, true),
      meta(web3, PROGRAMS.voter, false),
      meta(web3, PROGRAMS.token, false),
      meta(web3, PROGRAMS.system, false),
      meta(web3, PROGRAMS.jup, false),
    ], u64Bytes(2, amount)),
  ];
  return {
    kind: "jup-deposit",
    owner,
    jupRaw: amount.toString(),
    stake: parts.stake.toString(),
    short: parts.short.toString(),
    till: parts.till.toString(),
    pool: pool.toBase58(),
    instructions,
  };
}

export async function houseCrank(web3, input) {
  onlyKeys(input, ["sailor"]);
  const sailor = String(input.sailor || "");
  refuseSun(sailor);
  const live = boardOf(await readOnion());
  const card = live?.house;
  if (!card?.listed || !card.amount || !card.action) throw new Error("No house card is listed. Nothing to sign.");
  const buy = card.action === "buy";
  const amount = String(card.amount);
  const mark = BigInt(card.mark || "0");
  const raw = BigInt(amount);
  if (mark === 0n || raw === 0n) throw new Error("No house card is listed. Nothing to sign.");
  const floor = buy ? raw * 1000n / mark * 99n / 100n : raw * mark / 1000n * 99n / 100n;
  const inputMint = buy ? PROGRAMS.usdc : PROGRAMS.jup;
  const outputMint = buy ? PROGRAMS.jup : PROGRAMS.usdc;
  const quoted = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`);
  const quote = await quoted.json();
  if (!quoted.ok || BigInt(quote?.outAmount || "0") < floor) throw new Error("The Jupiter price is outside the house band. Nothing to sign.");
  const built = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: card.account || HOUSE_ACCOUNT,
      wrapAndUnwrapSol: false,
      asLegacyTransaction: true,
      dynamicComputeUnitLimit: false,
    }),
  });
  const payload = await built.json();
  if (!built.ok || !payload.swapTransaction) throw new Error("Jupiter did not return a route. Nothing to sign.");
  const bytes = Uint8Array.from(atob(payload.swapTransaction), (ch) => ch.charCodeAt(0));
  const swapTx = web3.Transaction.from(bytes);
  const swap = swapTx.instructions.find((item) => item.programId.equals(key(web3, PROGRAMS.jupiter)));
  if (!swap || swap.keys.length > 40) throw new Error("This route is too wide for the house. Nothing to sign.");
  const data = new Uint8Array(1 + swap.data.length);
  data[0] = 4;
  data.set(swap.data, 1);
  const house = card.account || HOUSE_ACCOUNT;
  const instructions = [ix(web3, PROGRAMS.house, [
    meta(web3, sailor, true, true),
    meta(web3, house, true),
    meta(web3, PROGRAMS.price, false),
    meta(web3, ata(web3, house, PROGRAMS.usdc), true),
    meta(web3, ata(web3, house, PROGRAMS.jup), true),
    meta(web3, ata(web3, SUN, PROGRAMS.usdc), true),
    meta(web3, PROGRAMS.token, false),
    meta(web3, PROGRAMS.jupiter, false),
    ...swap.keys.map((item) => ({ pubkey: item.pubkey, isSigner: false, isWritable: item.isWritable })),
  ], data)];
  return {
    kind: "house-crank",
    sailor,
    action: card.action,
    amount,
    bountyLamports: String(card.bountyLamports || "10000"),
    instructions,
  };
}

export async function delegatedCrank(web3, input) {
  onlyKeys(input, ["sailor", "vessel"]);
  const sailor = String(input.sailor || "");
  refuseSun(sailor);
  const live = boardOf(await readOnion());
  const row = (live?.cranks || []).find((item) => item.vessel === input.vessel);
  if (!row?.instruction || !row.owner || !row.vessel) throw new Error("That onion is not listed. Nothing to sign.");
  if (row.owner === SUN) throw new Error("The sun cannot be the delegator.");
  const data = Uint8Array.from(atob(row.instruction), (ch) => ch.charCodeAt(0));
  if (data.length !== 17 || data[0] !== 2) throw new Error("The listed crank was not a strategy instruction. Nothing to sign.");
  const price = live.price || PROGRAMS.price;
  const instructions = [ix(web3, PROGRAMS.onion, [
    meta(web3, sailor, true, true),
    meta(web3, row.vessel, true),
    meta(web3, row.owner, true),
    meta(web3, SUN, true),
    meta(web3, price, false),
  ], data)];
  return {
    kind: "delegated-crank",
    sailor,
    vessel: row.vessel,
    action: row.action,
    bountyLamports: String(row.bountyLamports || live?.offer?.bountyLamports || "10000"),
    instructions,
  };
}

export async function ready(web3, connection, owner, order) {
  refuseSun(owner);
  const tx = new web3.Transaction();
  tx.feePayer = key(web3, owner);
  for (const item of order.instructions) tx.add(item);
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.lastValidBlockHeight = latest.lastValidBlockHeight;
  return tx;
}
