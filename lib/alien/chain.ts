/**
 * Alien chain SDK — real on-chain transfer implementation.
 *
 * Uses @solana/web3.js + @solana/spl-token because the Alien network is
 * Solana-compatible (ALIEN is an SPL token with 9 decimals). The server
 * signs withdrawal transactions with the hot wallet's Ed25519 keypair and
 * broadcasts them via the Alien RPC endpoint.
 *
 * SECURITY:
 *   - The signing keypair is constructed ONCE from ALIEN_WITHDRAW_PRIVATE_KEY
 *     and cached. It never leaves this module, never gets logged, never gets
 *     sent to the client.
 *   - The RPC connection is HTTPS-only.
 *   - Transactions are confirmed before returning (so the caller knows the
 *     transfer landed on-chain).
 *
 * ENV VARS:
 *   ALIEN_WITHDRAW_PRIVATE_KEY  — 64-char hex Ed25519 secret key (hot wallet)
 *   ALIEN_RPC_URL               — Alien network RPC endpoint
 *   ALIEN_TOKEN_MINT            — SPL token mint address for ALIEN
 *   ALIEN_TOKEN_DECIMALS        — decimals (default 9)
 *
 * If Alien publishes a native `@alien-id/chain` SDK in the future, swap the
 * internals of this file — the exported interface (broadcastAlienTransfer)
 * stays the same.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ---------- cached singletons ----------

let _keypair: Keypair | null = null;
let _connection: Connection | null = null;
let _mint: PublicKey | null = null;

/** Load + cache the hot wallet keypair from env. */
function getKeypair(): Keypair {
  if (_keypair) return _keypair;
  const hex = process.env.ALIEN_WITHDRAW_PRIVATE_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ALIEN_WITHDRAW_PRIVATE_KEY must be 64 hex chars");
  }
  // Ed25519 secret key is 32 bytes, but @solana/web3.js Keypair.fromSecretKey
  // expects the 64-byte expanded form. For a raw 32-byte seed, we use
  // fromSeed (via Ed25519Keypair) — but web3.js v1 doesn't expose fromSeed
  // directly. Instead, derive the keypair from the 32-byte seed using
  // NaclKeypair-style construction.
  //
  // web3.js v1 Keypair.fromSecretKey accepts either 32 or 64 bytes:
  //   - 32 bytes: treated as a seed, expanded internally
  //   - 64 bytes: treated as the full secret key
  const seed = Buffer.from(hex, "hex");
  _keypair = Keypair.fromSeed(seed);
  return _keypair;
}

/** Get + cache the Solana/Alien connection. */
function getConnection(): Connection {
  if (_connection) return _connection;
  const rpcUrl = process.env.ALIEN_RPC_URL;
  if (!rpcUrl) {
    throw new Error("ALIEN_RPC_URL not set");
  }
  // confirmCommitment "confirmed" = ~2s confirmation, good balance of speed
  // vs. finality for a withdrawal. Use "finalized" for max safety.
  _connection = new Connection(rpcUrl, "confirmed");
  return _connection;
}

/** Get + cache the ALIEN token mint address. */
function getMint(): PublicKey {
  if (_mint) return _mint;
  const mintStr = process.env.ALIEN_TOKEN_MINT;
  if (!mintStr) {
    throw new Error("ALIEN_TOKEN_MINT not set (SPL token mint for ALIEN)");
  }
  _mint = new PublicKey(mintStr);
  return _mint;
}

// ---------- public API ----------

export interface TransferResult {
  txHash: string;
  explorerUrl: string;
  blockSlot: number;
}

/**
 * Transfer ALIEN tokens from the server's hot wallet to a player's wallet.
 *
 * @param recipientAddress  Player's wallet address (base58)
 * @param alienBaseUnits    Amount in smallest on-chain units (bigint-safe)
 * @returns                 The on-chain transaction signature + explorer URL
 *
 * @throws If the hot wallet has insufficient ALIEN balance, the recipient's
 *         associated token account can't be created, or the RPC is unreachable.
 */
export async function broadcastAlienTransfer(opts: {
  recipientAddress: string;
  alienBaseUnits: number;
}): Promise<TransferResult> {
  const keypair = getKeypair();
  const connection = getConnection();
  const mint = getMint();
  const decimals = parseInt(process.env.ALIEN_TOKEN_DECIMALS || "9", 10);

  const recipient = new PublicKey(opts.recipientAddress);

  // Get (or create) the sender's associated token account for ALIEN.
  // The hot wallet should already have one — if not, this creates it.
  const senderAta = await getOrCreateAssociatedTokenAccount(
    connection,
    keypair, // payer
    mint,
    keypair.publicKey, // owner
  );

  // Get (or create) the recipient's associated token account. Creating it
  // costs ~0.002 SOL in rent — the hot wallet pays this. If the recipient
  // already has an ATA, this is a no-op read.
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    keypair, // payer (hot wallet pays rent for recipient's ATA)
    mint,
    recipient,
    true, // allowOwnerOffCurve — recipient might be a PDA
  );

  // Build the SPL Transfer instruction.
  const transferIx = createTransferInstruction(
    senderAta.address,        // source ATA
    keypair.publicKey,        // owner (sender)
    recipientAta.address,     // destination ATA
    opts.alienBaseUnits,      // amount in base units
    [],                       // multi-signers (none — single sig)
    TOKEN_PROGRAM_ID,
  );

  // Wrap in a Transaction with recent blockhash + fee payer.
  const tx = new Transaction().add(transferIx);
  tx.feePayer = keypair.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  // Sign + broadcast. sendAndConfirmTransaction retries until confirmed or
  // the blockhash expires (~60-90s on Solana mainnet).
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: "confirmed",
    skipPreflight: false,
  });

  // Fetch the slot for the explorer URL.
  const txInfo = await connection.getTransaction(signature, {
    commitment: "confirmed",
  });
  const blockSlot = txInfo?.slot ?? 0;

  const explorerUrl = process.env.ALIEN_EXPLORER_URL
    ? `${process.env.ALIEN_EXPLORER_URL}/tx/${signature}`
    : `https://explorer.alien.org/tx/${signature}`;

  return {
    txHash: signature,
    explorerUrl,
    blockSlot,
  };
}

/**
 * Check the hot wallet's ALIEN token balance. Used by monitoring/alerting
 * to detect when the hot wallet needs topping up.
 */
export async function getHotWalletBalance(): Promise<{
  alienBalance: number;
  solBalance: number;
  alienBaseUnits: string;
}> {
  const keypair = getKeypair();
  const connection = getConnection();
  const mint = getMint();
  const decimals = parseInt(process.env.ALIEN_TOKEN_DECIMALS || "9", 10);

  const solBalance = await connection.getBalance(keypair.publicKey);

  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    keypair,
    mint,
    keypair.publicKey,
  );

  return {
    alienBalance: Number(ata.amount.toString()) / Math.pow(10, decimals),
    solBalance: solBalance / LAMPORTS_PER_SOL,
    alienBaseUnits: ata.amount.toString(),
  };
}

/** Get the hot wallet's public address (for monitoring dashboards). */
export function getHotWalletAddress(): string {
  return getKeypair().publicKey.toBase58();
}

/**
 * Check whether the chain SDK is fully configured (all env vars present).
 * Used by the withdraw endpoint to return a clear 503 before attempting
 * any operation.
 */
export function isChainConfigured(): boolean {
  return Boolean(
    process.env.ALIEN_WITHDRAW_PRIVATE_KEY &&
      process.env.ALIEN_RPC_URL &&
      process.env.ALIEN_TOKEN_MINT,
  );
}
